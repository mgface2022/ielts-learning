import { ReactNode, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { TickPlayButton } from '../components/TickPlayButton';
import { numberLabel } from '../articles';
import { formatMillis, player } from '../player';
import { saveLoopCount } from '../storage';
import { colors, space } from '../theme';
import type { Article } from '../types';
import { usePlayer } from '../usePlayer';

const TABS = ['听读', '词汇', '词块', '译文'] as const;
// 正文循环播放可选次数
const LOOP_OPTIONS = [1, 5, 10] as const;
// 分屏时右栏可切换的内容
const RIGHT_TABS = ['译文', '词汇', '词块'] as const;
// 窗口宽度达到该值（dp）时启用分屏：左边固定听读，右边译文/词汇/词块可切换。
// 取 Android 官方窗口尺寸分级的 medium 边界 600dp：折叠屏展开的内屏（竖持约
// 690dp，随显示缩放浮动）、平板、手机横屏都会命中；折叠屏外屏和直板机竖屏
// （通常 360~450dp）不受影响。
const WIDE_BREAKPOINT = 600;

type Props = {
  article: Article;
  learned: boolean;
  favorites: Set<string>;
  highlight?: string;
  onBack: () => void;
  onToggleLearned: () => void;
  onToggleFavorite: (id: string) => void;
};

/** 正文中要标记的词条：term 是在正文里实际出现的形式，num 是词表序号 */
type MarkTerm = { term: string; num?: number };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeMatch(body: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(body);
}

// 只剩这类占位/虚词时不值得在正文里标记
const FILLER = /^(sth|sb|do|does|doing|did|one'?s|a|an|the|to|of|for|in|on|at|be|is|are|was|were)$/i;

/**
 * 找出词条在正文里实际出现的形式。
 * 词汇可能给的是原形（正文是变形），词块常带 "doing sth" 这类占位词，
 * 所以按"最长连续词片段"降级匹配：整条 → 去头去尾的子片段 → 单个实词。
 */
function resolveTerm(en: string, lemma: string | null | undefined, body: string): string | null {
  if (hasWholeMatch(body, en)) return en;
  if (lemma && hasWholeMatch(body, lemma)) return lemma;
  const tokens = en.split(/\s+/).filter(Boolean);
  for (let len = tokens.length - 1; len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const candidate = tokens.slice(start, start + len).join(' ');
      if (len === 1 && FILLER.test(candidate)) continue;
      if (hasWholeMatch(body, candidate)) return candidate;
    }
  }
  return null;
}

/** 在一段文本里标出所有词条（整词匹配、大小写不敏感），可选带序号上标 */
function markTerms(text: string, terms: MarkTerm[], keyPrefix: string): ReactNode {
  if (terms.length === 0) return text;
  const matches: { start: number; end: number; num?: number }[] = [];
  for (const { term, num } of terms) {
    if (!term) continue;
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, num });
    }
  }
  if (matches.length === 0) return text;
  // 位置相同时长的优先，重叠的丢弃
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      kept.push(m);
      lastEnd = m.end;
    }
  }
  const parts: ReactNode[] = [];
  let pos = 0;
  let seq = 0;
  for (const m of kept) {
    if (m.start > pos) parts.push(text.slice(pos, m.start));
    parts.push(
      <Text key={`${keyPrefix}-m${seq}`} style={styles.mark}>
        {text.slice(m.start, m.end)}
      </Text>,
    );
    if (m.num != null) {
      parts.push(
        <Text key={`${keyPrefix}-n${seq}`} style={styles.markNum}>
          {m.num}
        </Text>,
      );
    }
    seq += 1;
    pos = m.end;
  }
  parts.push(text.slice(pos));
  return parts;
}

export function ArticleScreen({
  article,
  learned,
  favorites,
  highlight,
  onBack,
  onToggleLearned,
  onToggleFavorite,
}: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('听读');
  const [rightTab, setRightTab] = useState<(typeof RIGHT_TABS)[number]>('译文');
  const playback = usePlayer();
  const bodyId = `body:${article.id}`;
  const isBody = playback.currentId === bodyId;
  // 分屏判断不能依赖 useWindowDimensions：折叠屏"小屏打开后再展开"时，
  // 系统上报的窗口宽度和实际渲染宽度可能不同步，导致分屏中线偏移。
  // 改用 onLayout 实测根视图宽度，它永远等于实际画出来的宽度，
  // 折叠/展开时也会重新触发。窗口宽度只作首帧未测量前的兜底。
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const wide = (measuredWidth > 0 ? measuredWidth : windowWidth) >= WIDE_BREAKPOINT;

  // 正文里要标记的词条：右栏显示词汇/词块时带序号标出每个出现位置；
  // 从复习页跳转带来的 highlight 词永远标出（无序号）
  const bodyMarks = useMemo<MarkTerm[]>(() => {
    const list: MarkTerm[] = [];
    if (wide && rightTab === '词汇') {
      article.vocab.forEach((item, index) => {
        const term = resolveTerm(item.en, item.lemma, article.body);
        if (term) list.push({ term, num: index + 1 });
      });
    } else if (wide && rightTab === '词块') {
      article.chunks.forEach((item, index) => {
        const term = resolveTerm(item.en, null, article.body);
        if (term) list.push({ term, num: index + 1 });
      });
    }
    if (highlight) list.push({ term: highlight });
    return list;
  }, [wide, rightTab, article, highlight]);

  const bodyNode =
    article.sentences && article.sentences.length > 0 ? (
      <Text style={styles.body}>
        {article.sentences.map((sentence, index) => {
          const next = article.sentences![index + 1];
          const active =
            isBody &&
            playback.position >= sentence.start &&
            (next ? playback.position < next.start : playback.position <= sentence.end + 500);
          return (
            <Text
              key={index}
              suppressHighlighting
              style={active ? styles.sentenceOn : undefined}
              onPress={() => {
                void player.playFrom(bodyId, article.bodyAudio, sentence.start, article.title);
              }}
            >
              {markTerms(sentence.text, bodyMarks, `s${index}`)}
              {index < article.sentences!.length - 1 ? ' ' : ''}
            </Text>
          );
        })}
      </Text>
    ) : (
      <Text style={styles.body}>{markTerms(article.body, bodyMarks, 'b')}</Text>
    );

  const vocabRows = article.vocab.map((item, index) => {
    const id = `vocab:${article.id}:${index}`;
    return (
      <EntryRow
        key={`${item.en}-${index}`}
        num={index + 1}
        id={id}
        audio={item.audio}
        title={item.en}
        subtitle={`${item.pos ?? ''}${item.lemma ? ` · ${item.lemma}` : ''}  ${item.zh}`.trim()}
        currentId={playback.currentId}
        playing={playback.playing}
        progress={playback.progress}
        favorite={favorites.has(id)}
        onToggleFavorite={() => onToggleFavorite(id)}
      />
    );
  });

  const chunkRows = article.chunks.map((item, index) => {
    const id = `chunk:${article.id}:${index}`;
    return (
      <EntryRow
        key={`${item.en}-${index}`}
        num={index + 1}
        id={id}
        audio={item.audio}
        title={item.en}
        subtitle={item.zh}
        currentId={playback.currentId}
        playing={playback.playing}
        progress={playback.progress}
        favorite={favorites.has(id)}
        onToggleFavorite={() => onToggleFavorite(id)}
      />
    );
  });

  // 编号/标题/播放器：窄屏横跨全屏，宽屏归入左栏，
  // 让右栏从顶栏下方直接开始排布，左右真正各占一半
  const headerNode = (
    <>
      <Text style={styles.kicker}>{numberLabel(article.number)}</Text>
      <Text style={styles.title}>{article.title}</Text>

      <View style={styles.playerRow}>
        <TickPlayButton
          playing={isBody && playback.playing}
          progress={isBody ? playback.progress : 0}
          onPress={() => {
            void player.toggle(bodyId, article.bodyAudio, article.title);
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.playerTitle}>听全文</Text>
          <Text style={styles.playerMeta}>
            {isBody && playback.duration > 0
              ? `${playback.loopTarget > 1 ? `第 ${playback.loopIndex} / ${playback.loopTarget} 遍 · ` : ''}${formatMillis(playback.position)} / ${formatMillis(playback.duration)}`
              : '大约一分钟 · 美式女声'}
          </Text>
          <View style={styles.loopRow}>
            <Text style={styles.loopLabel}>循环</Text>
            {LOOP_OPTIONS.map((n) => {
              const active = playback.loopTarget === n;
              return (
                <Pressable
                  key={n}
                  hitSlop={6}
                  onPress={() => {
                    player.setLoop(n);
                    void saveLoopCount(n);
                  }}
                  style={[styles.loopPill, active && styles.loopPillOn]}
                >
                  <Text style={[styles.loopText, active && styles.loopTextOn]}>
                    {n === 1 ? '1次' : `${n}次`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </>
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Pressable onPress={onToggleLearned} hitSlop={8} style={styles.learnBtn}>
          <Text style={[styles.learn, learned && styles.learnOn]}>
            {learned ? '已学' : '标为已学'}
          </Text>
        </Pressable>
      </View>

      {wide ? (
        <View style={[styles.content, styles.contentWide]}>
          <View style={styles.mainPane}>
            {headerNode}
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {bodyNode}
            </ScrollView>
          </View>

          <View style={styles.rightPane}>
            <View style={styles.tabs}>
              {RIGHT_TABS.map((item) => {
                const active = item === rightTab;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setRightTab(item)}
                    style={[styles.tab, active && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextOn]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {rightTab === '译文' ? (
                <Text style={styles.translation}>{article.translation}</Text>
              ) : null}
              {rightTab === '词汇' ? vocabRows : null}
              {rightTab === '词块' ? chunkRows : null}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          {headerNode}
          <View style={styles.tabs}>
            {TABS.map((item) => {
              const active = item === tab;
              return (
                <Pressable
                  key={item}
                  onPress={() => setTab(item)}
                  style={[styles.tab, active && styles.tabOn]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextOn]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {tab === '听读' ? bodyNode : null}
            {tab === '词汇' ? vocabRows : null}
            {tab === '词块' ? chunkRows : null}
            {tab === '译文' ? <Text style={styles.translation}>{article.translation}</Text> : null}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function EntryRow({
  num,
  id,
  audio,
  title,
  subtitle,
  currentId,
  playing,
  progress,
  favorite,
  onToggleFavorite,
}: {
  num: number;
  id: string;
  audio: string;
  title: string;
  subtitle: string;
  currentId: string | null;
  playing: boolean;
  progress: number;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const active = currentId === id;
  return (
    <View style={styles.entry}>
      <Text style={styles.entryNum}>{num}</Text>
      <TickPlayButton
        size={52}
        playing={active && playing}
        progress={active ? progress : 0}
        onPress={() => {
          void player.toggle(id, audio, title);
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.entryEn}>{title}</Text>
        <Text style={styles.entryZh}>{subtitle}</Text>
      </View>
      <Pressable hitSlop={10} onPress={onToggleFavorite} style={styles.starBtn}>
        <Text style={[styles.star, favorite && styles.starOn]}>{favorite ? '★' : '☆'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.blotter },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  backBtn: { minHeight: 44, justifyContent: 'center' },
  back: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  learnBtn: { minHeight: 44, justifyContent: 'center' },
  learn: { color: colors.mist, fontSize: 15, fontWeight: '700' },
  learnOn: { color: colors.second },
  kicker: {
    paddingHorizontal: space.lg,
    marginTop: 4,
    color: colors.second,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  title: {
    paddingHorizontal: space.lg,
    marginTop: 2,
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  playerTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  playerMeta: { marginTop: 4, color: colors.mist, fontSize: 13 },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  loopLabel: { color: colors.mist, fontSize: 12, fontWeight: '700', marginRight: 2 },
  loopPill: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  loopPillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  loopText: { color: colors.mist, fontSize: 12, fontWeight: '700' },
  loopTextOn: { color: colors.white },
  content: { flex: 1 },
  contentWide: { flexDirection: 'row' },
  // 左右两栏平分屏幕宽度
  mainPane: { flex: 1 },
  rightPane: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.line,
    backgroundColor: colors.card,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: colors.second },
  tabText: { color: colors.mist, fontSize: 15, fontWeight: '700' },
  tabTextOn: { color: colors.ink },
  scroll: { padding: space.lg, paddingBottom: 48 },
  body: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 32,
    fontFamily: 'serif',
  },
  sentenceOn: {
    color: colors.second,
    backgroundColor: 'rgba(216, 90, 26, 0.10)',
    fontWeight: '700',
  },
  mark: {
    color: colors.second,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  markNum: {
    color: colors.second,
    fontSize: 11,
    fontWeight: '800',
  },
  translation: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 30,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  entryNum: {
    minWidth: 22,
    color: colors.second,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  entryEn: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  entryZh: { marginTop: 3, color: colors.mist, fontSize: 14, lineHeight: 20 },
  starBtn: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 24, color: colors.line },
  starOn: { color: colors.second },
});
