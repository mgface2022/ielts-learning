#!/usr/bin/env python3
"""把《雅思词汇-阅读写作分册.md》转成 App 课程数据，并用 edge-tts 生成全部音频。

用法（edge-tts 需较新版本，旧版会被微软接口 403 拒绝: pip install -U edge-tts）:
  /tmp/tts-venv/bin/python scripts/gen-ielts.py            # 生成
  /tmp/tts-venv/bin/python scripts/gen-ielts.py --dry-run  # 只解析，打印课程列表

每个最小小节（#### 或无子节的 ###）是一课，超过 MAX_PER_LESSON 条时均分成几课。
数据结构沿用 articles.json 原有字段，App 端无需改逻辑：
  - body / sentences   每条词条或句子一行；正文音频按条拼接，sentences 记录每条的起止毫秒
  - vocab              单词（拆分 ; / // 后每段都是单个词）
  - chunks             词组、搭配；句型类小节里是整句
  - translation        与正文逐行对应的中文（词汇课带英文对照）

产出:
  - assets/audio/<id>/<id>.mp3          正文音频：单词/词组课 = 英文 + 中文释义；句型课 = 英文
  - assets/audio/<id>/vocab-NN-*.mp3    单词发音
  - assets/audio/<id>/chunk-NN-*.mp3    词组/句子发音
  - assets/articles.json
TTS 结果缓存在 .tts-cache/，重跑只会请求新增或改动的文本。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "雅思词汇-阅读写作分册.md"
DATA = ROOT / "assets" / "articles.json"
AUDIO_DIR = ROOT / "assets" / "audio"
CACHE = ROOT / ".tts-cache"

VOICE_EN = "en-US-JennyNeural"
VOICE_ZH = "zh-CN-XiaoxiaoNeural"
CONCURRENCY = 8
MAX_PER_LESSON = 40
# 正文音频里各段之间的停顿（毫秒）
GAP_EN_ZH = 400
GAP_AFTER_WORD = 900
GAP_AFTER_SENTENCE = 1200
# edge-tts 默认输出 audio-24khz-48kbitrate-mono-mp3（CBR），字节数 / 6 = 毫秒
BYTES_PER_MS = 48000 / 8 / 1000

SKIP_H2 = {"目录"}
# 这些大部分的小节名比较泛（如"动词类"），标题前加前缀区分
H2_PREFIX = {
    "大作文常考话题高分表达": "话题",
    "附录 雅思阅读真题同义表达": "同义替换",
}


@dataclass
class Entry:
    en: str
    pos: str | None
    zh: str
    kind: str  # vocab | chunk | sentence


@dataclass
class Group:
    h2: str
    h3: str | None
    h4: str | None
    entries: list[Entry] = field(default_factory=list)
    # (插在第几条之前, 说明文字)
    notes: list[tuple[int, str]] = field(default_factory=list)

    @property
    def title(self) -> str:
        base = " · ".join(x for x in (self.h3, self.h4) if x) or self.h2
        prefix = H2_PREFIX.get(self.h2)
        return f"{prefix} · {base}" if prefix else base


@dataclass
class Lesson:
    title: str
    entries: list[Entry]
    notes: list[tuple[int, str]]


def split_cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def is_single_words(en: str) -> bool:
    parts = [p.strip() for p in re.split(r"//|;|/|,", en) if p.strip()]
    return bool(parts) and all(" " not in p for p in parts)


def parse(text: str) -> list[Group]:
    groups: dict[tuple, Group] = {}
    h2 = h3 = h4 = None
    header: list[str] | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("## "):
            h2, h3, h4, header = line[3:].strip(), None, None, None
            continue
        if line.startswith("### "):
            h3, h4, header = re.sub(r"^\d+\.\s*", "", line[4:].strip()), None, None
            continue
        if line.startswith("#### "):
            h4, header = line[5:].strip(), None
            continue
        if h2 is None or h2 in SKIP_H2:
            continue
        key = (h2, h3, h4)
        if line.startswith(">"):
            group = groups.setdefault(key, Group(h2, h3, h4))
            group.notes.append((len(group.entries), line.lstrip("> ").strip()))
            continue
        if not line.startswith("|"):
            continue
        cells = split_cells(line)
        if cells[0] == "英文":
            header = cells
            continue
        if not cells[0] or set(cells[0]) <= set("-: "):
            continue
        if header is None or len(cells) != len(header):
            raise ValueError(f"无法解析表格行: {raw}")
        en = cells[0]
        zh = cells[-1].replace("<br>", "；")
        pos = cells[1] if len(cells) == 3 and cells[1] not in ("—", "-", "") else None
        if header[-1] == "中文译文":
            kind = "sentence"
        else:
            kind = "vocab" if is_single_words(en) else "chunk"
        groups.setdefault(key, Group(h2, h3, h4)).entries.append(Entry(en, pos, zh, kind))
    return [g for g in groups.values() if g.entries]


def to_lessons(groups: list[Group]) -> list[Lesson]:
    lessons: list[Lesson] = []
    for g in groups:
        n = len(g.entries)
        parts = math.ceil(n / MAX_PER_LESSON)
        size = math.ceil(n / parts)
        for i in range(parts):
            lo, hi = i * size, min(n, (i + 1) * size)
            title = g.title if parts == 1 else f"{g.title} {i + 1}/{parts}"
            notes = [(idx - lo, t) for idx, t in g.notes if lo <= idx < hi or (i == 0 and idx < lo)]
            lessons.append(Lesson(title, g.entries[lo:hi], notes))
    return lessons


def tts_text_en(s: str) -> str:
    s = s.replace("//", ";")
    s = re.sub(r"\bsb\.", "somebody", s)
    s = re.sub(r"\bsth\.", "something", s)
    s = re.sub(r"\bsb\b", "somebody", s)
    s = re.sub(r"\bsth\b", "something", s)
    # dramatic(ally) → dramatic, dramatically
    s = re.sub(r"([A-Za-z]+)\(([a-z]+)\)", r"\1, \1\2", s)
    s = s.replace("(", " ").replace(")", " ")
    s = re.sub(r"(?<=[A-Za-z%])\s*/\s*(?=[A-Za-z])", " or ", s)
    s = re.sub(r"\.{2,}|…+", ", ", s)
    s = re.sub(r"\s*,(\s*,)+", ",", s)
    s = re.sub(r"\s+([,;.])", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s


def tts_text_zh(s: str) -> str:
    s = s.replace("<br>", "；")
    s = re.sub(r"……|…+|·\.|\.{2,}|·", "，", s)
    s = s.replace("/", "或").replace("(", "").replace(")", "")
    s = s.replace("（", "").replace("）", "")
    s = re.sub(r"[，,]{2,}", "，", s)
    return s.strip(" ，,；;")


def slugify(text: str, limit: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:limit].rstrip("-") or "item"


def ms_of(data: bytes) -> float:
    return len(data) / BYTES_PER_MS


MP3_OUT = ["-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k",
           "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3"]


async def tts(text: str, voice: str, sem: asyncio.Semaphore) -> bytes:
    """合成并裁掉首尾静音（edge-tts 每段前约 0.2s、后约 1s 空白，拼接后节奏太拖）。"""
    key = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()
    raw = CACHE / f"{key}.mp3"
    trimmed = CACHE / f"{key}.trim.mp3"
    if trimmed.exists():
        return trimmed.read_bytes()
    if not raw.exists():
        await synthesize(text, voice, raw, sem)
    async with sem:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-loglevel", "error", "-y", "-i", str(raw),
            "-af",
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
            "areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,"
            "areverse",
            *MP3_OUT, str(trimmed),
        )
        if await proc.wait() != 0:
            raise RuntimeError(f"ffmpeg trim failed: {raw}")
    return trimmed.read_bytes()


async def synthesize(text: str, voice: str, path: Path, sem: asyncio.Semaphore) -> None:
    import edge_tts

    async with sem:
        last_err: Exception | None = None
        for attempt in range(6):
            try:
                audio = bytearray()
                async for chunk in edge_tts.Communicate(text, voice).stream():
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                if len(audio) < 500:
                    raise RuntimeError(f"audio too small ({len(audio)} bytes)")
                path.write_bytes(bytes(audio))
                return
            except Exception as err:  # 网络抖动/限流，退避重试
                last_err = err
                await asyncio.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"TTS failed for {voice} {text!r}: {last_err}")


def silence(ms: int) -> bytes:
    path = CACHE / f"silence-{ms}.mp3"
    if not path.exists():
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                "-t", f"{ms / 1000}",
                *MP3_OUT, str(path),
            ],
            check=True,
        )
    return path.read_bytes()


def translation_text(lesson: Lesson) -> str:
    notes: dict[int, list[str]] = {}
    for idx, text in lesson.notes:
        notes.setdefault(idx, []).append(text)
    lines: list[str] = []
    for i, e in enumerate(lesson.entries):
        for text in notes.get(i, []):
            lines.append(f"【{text}】")
        if e.kind == "sentence":
            lines.append(e.zh)
        else:
            pos = f"{e.pos} " if e.pos else ""
            lines.append(f"{e.en}　{pos}{e.zh}")
    return "\n".join(lines)


async def build(lessons: list[Lesson]) -> list[dict]:
    sem = asyncio.Semaphore(CONCURRENCY)
    gaps = {ms: silence(ms) for ms in (GAP_EN_ZH, GAP_AFTER_WORD, GAP_AFTER_SENTENCE)}

    en_texts = {tts_text_en(e.en) for l in lessons for e in l.entries}
    zh_texts = {tts_text_zh(e.zh) for l in lessons for e in l.entries if e.kind != "sentence"}
    jobs = [(t, VOICE_EN) for t in sorted(en_texts)] + [(t, VOICE_ZH) for t in sorted(zh_texts)]
    print(f"TTS: {len(en_texts)} 条英文 + {len(zh_texts)} 条中文")

    done = 0
    audio: dict[tuple[str, str], bytes] = {}

    async def run(text: str, voice: str) -> None:
        nonlocal done
        audio[(text, voice)] = await tts(text, voice, sem)
        done += 1
        if done % 200 == 0 or done == len(jobs):
            print(f"  {done}/{len(jobs)}")

    await asyncio.gather(*(run(t, v) for t, v in jobs))

    if AUDIO_DIR.exists():
        shutil.rmtree(AUDIO_DIR)
    articles = []
    for number, lesson in enumerate(lessons, start=1):
        aid = f"{number:03d}"
        folder = AUDIO_DIR / aid
        folder.mkdir(parents=True, exist_ok=True)
        rel = f"assets/audio/{aid}"

        body = bytearray()
        offset = 0.0
        sentences = []
        vocab, chunks = [], []
        for e in lesson.entries:
            en_audio = audio[(tts_text_en(e.en), VOICE_EN)]
            start = offset
            body += en_audio
            offset += ms_of(en_audio)
            if e.kind == "sentence":
                tail = gaps[GAP_AFTER_SENTENCE]
            else:
                zh_audio = audio[(tts_text_zh(e.zh), VOICE_ZH)]
                body += gaps[GAP_EN_ZH] + zh_audio
                offset += ms_of(gaps[GAP_EN_ZH]) + ms_of(zh_audio)
                tail = gaps[GAP_AFTER_WORD]
            sentences.append({"text": e.en, "start": int(start), "end": int(offset)})
            body += tail
            offset += ms_of(tail)

            if e.kind == "vocab":
                name = f"vocab-{len(vocab) + 1:02d}-{slugify(e.en)}.mp3"
                vocab.append({"en": e.en, "pos": e.pos, "lemma": None, "zh": e.zh, "audio": f"{rel}/{name}"})
            else:
                name = f"chunk-{len(chunks) + 1:02d}-{slugify(e.en)}.mp3"
                chunks.append({"en": e.en, "zh": e.zh, "audio": f"{rel}/{name}"})
            (folder / name).write_bytes(en_audio)

        (folder / f"{aid}.mp3").write_bytes(bytes(body))
        articles.append(
            {
                "id": aid,
                "number": number,
                "title": lesson.title,
                "body": "\n".join(e.en for e in lesson.entries),
                "translation": translation_text(lesson),
                "bodyAudio": f"{rel}/{aid}.mp3",
                "sentences": sentences,
                "vocab": vocab,
                "chunks": chunks,
            }
        )
        print(f"ok {aid} {lesson.title}: {len(lesson.entries)} 条, {offset / 1000:.0f}s")
    return articles


def main() -> None:
    dry = "--dry-run" in sys.argv
    lessons = to_lessons(parse(SOURCE.read_text(encoding="utf-8")))
    if dry:
        for i, l in enumerate(lessons, start=1):
            kinds = {k: sum(e.kind == k for e in l.entries) for k in ("vocab", "chunk", "sentence")}
            print(f"{i:03d} {l.title}  {kinds}")
        total = sum(len(l.entries) for l in lessons)
        print(f"{len(lessons)} 课, {total} 条")
        return
    CACHE.mkdir(exist_ok=True)
    articles = asyncio.run(build(lessons))
    DATA.write_text(
        json.dumps({"articles": articles}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"articles.json updated: {len(articles)} 课")


if __name__ == "__main__":
    main()
