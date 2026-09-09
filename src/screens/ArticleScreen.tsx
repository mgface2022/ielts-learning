import { ReactNode, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TickPlayButton } from '../components/TickPlayButton';
import { numberLabel } from '../articles';
import { formatMillis, player } from '../player';
import { colors, space } from '../theme';
import type { Article } from '../types';
import { usePlayer } from '../usePlayer';

const TABS = ['听读', '词汇', '词块', '译文'] as const;

type Props = {
  article: Article;
  learned: boolean;
  favorites: Set<string>;
  highlight?: string;
  onBack: () => void;
  onToggleLearned: () => void;
  onToggleFavorite: (id: string) => void;
};

/** 在句子文本里高亮命中的词/词块（大小写不敏感） */
function markTerm(text: string, term: string | undefined, keyPrefix: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  let idx = lower.indexOf(needle);
  if (idx < 0) return text;
  const parts: ReactNode[] = [];
  let pos = 0;
  let seq = 0;
  while (idx >= 0) {
    if (idx > pos) parts.push(text.slice(pos, idx));
    parts.push(
      <Text key={`${keyPrefix}-${seq++}`} style={styles.mark}>
        {text.slice(idx, idx + term.length)}
      </Text>,
    );
    pos = idx + term.length;
    idx = lower.indexOf(needle, pos);
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
  const playback = usePlayer();
  const bodyId = `body:${article.id}`;
  const isBody = playback.currentId === bodyId;

  return (
    <View style={styles.root}>
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
              ? `${formatMillis(playback.position)} / ${formatMillis(playback.duration)}`
              : '大约一分钟 · 美式女声'}
          </Text>
        </View>
      </View>

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
        {tab === '听读' ? (
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
                    {markTerm(sentence.text, highlight, `s${index}`)}
                    {index < article.sentences!.length - 1 ? ' ' : ''}
                  </Text>
                );
              })}
            </Text>
          ) : (
            <Text style={styles.body}>{markTerm(article.body, highlight, 'b')}</Text>
          )
        ) : null}
        {tab === '词汇'
          ? article.vocab.map((item, index) => {
              const id = `vocab:${article.id}:${index}`;
              return (
                <EntryRow
                  key={`${item.en}-${index}`}
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
            })
          : null}
        {tab === '词块'
          ? article.chunks.map((item, index) => {
              const id = `chunk:${article.id}:${index}`;
              return (
                <EntryRow
                  key={`${item.en}-${index}`}
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
            })
          : null}
        {tab === '译文' ? <Text style={styles.translation}>{article.translation}</Text> : null}
      </ScrollView>
    </View>
  );
}

function EntryRow({
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
  entryEn: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  entryZh: { marginTop: 3, color: colors.mist, fontSize: 14, lineHeight: 20 },
  starBtn: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 24, color: colors.line },
  starOn: { color: colors.second },
});
