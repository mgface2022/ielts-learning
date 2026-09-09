#!/usr/bin/env python3
"""重新生成 65 篇正文音频，并捕获逐词时间戳聚合为句子时间线。

用法: /tmp/tts-venv/bin/python scripts/gen-body-timings.py

产出:
  - assets/audio/<id>/<id>.mp3           重新生成的正文音频
  - assets/articles.json                 每篇文章新增 sentences: [{text, start, end}] (毫秒)
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "assets" / "articles.json"
VOICE = "en-US-JennyNeural"
CONCURRENCY = 4


def split_sentences(body: str) -> list[tuple[str, int, int]]:
    """按句切分正文，返回 (句子, 起始字符位置, 结束字符位置)。"""
    text = body.strip()
    parts = re.split(r"(?<=[.!?])\s+", text)
    out: list[tuple[str, int, int]] = []
    pos = 0
    for part in parts:
        if not part:
            continue
        start = body.find(part, pos)
        if start < 0:
            start = pos
        out.append((part, start, start + len(part)))
        pos = start + len(part)
    return out


async def generate(article: dict, sem: asyncio.Semaphore) -> None:
    async with sem:
        body: str = article["body"]
        sentences = split_sentences(body)

        audio = bytearray()
        # (字符位置, 开始ms, 结束ms)
        words: list[tuple[int, float, float]] = []
        search_pos = 0

        communicate = edge_tts.Communicate(body, VOICE, boundary="WordBoundary")
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                token = chunk["text"]
                start_ms = chunk["offset"] / 10000
                end_ms = (chunk["offset"] + chunk["duration"]) / 10000
                idx = body.find(token, search_pos)
                if idx >= 0:
                    search_pos = idx + len(token)
                else:
                    # TTS 可能把数字等念成别的词形，按当前进度归位
                    idx = search_pos
                words.append((idx, start_ms, end_ms))

        if len(audio) < 1000:
            raise RuntimeError(f"{article['id']}: audio too small ({len(audio)} bytes)")
        if not words:
            raise RuntimeError(f"{article['id']}: no word boundaries received")

        timeline = []
        prev_end = 0
        for text, a, b in sentences:
            ws = [w for w in words if a <= w[0] < b]
            if ws:
                start = int(ws[0][1])
                end = int(ws[-1][2])
            else:
                start = prev_end
                end = prev_end
            timeline.append({"text": text, "start": start, "end": end})
            prev_end = end

        out = ROOT / article["bodyAudio"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(bytes(audio))
        article["sentences"] = timeline
        total = timeline[-1]["end"] / 1000 if timeline else 0
        print(f"ok {article['id']}: {len(timeline)} sentences, ~{total:.1f}s, {len(audio)//1024}KB")


async def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    articles = data["articles"]
    sem = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(
        *(generate(a, sem) for a in articles), return_exceptions=True
    )
    failed = [r for r in results if isinstance(r, Exception)]
    for err in failed:
        print(f"FAILED: {err}", file=sys.stderr)
    if failed:
        sys.exit(1)
    DATA.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"articles.json updated: {len(articles)} articles")


if __name__ == "__main__":
    asyncio.run(main())
