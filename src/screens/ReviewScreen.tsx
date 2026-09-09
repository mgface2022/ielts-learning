import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TickPlayButton } from '../components/TickPlayButton';
import { loadArticles, numberLabel } from '../articles';
import { player } from '../player';
import { colors, space } from '../theme';
import type { Article } from '../types';
import { usePlayer } from '../usePlayer';

const FILTERS = ['全部', '单词', '词块'] as const;

type FavItem = {
  key: string;
  kind: 'vocab' | 'chunk';
  article: Article;
  en: string;
  lemma: string | null;
  subtitle: string;
  audio: string;
};

type Props = {
  favorites: Set<string>;
  onBack: () => void;
  onToggleFavorite: (id: string) => void;
  onOpenArticle: (articleId: string, highlight: string) => void;
};

/** 选取真实出现在正文里的形式，跳转后才能定位高亮 */
function pickHighlight(item: FavItem): string {
  const body = item.article.body.toLowerCase();
  if (body.includes(item.en.toLowerCase())) return item.en;
  if (item.lemma && body.includes(item.lemma.toLowerCase())) return item.lemma;
  return item.en;
}

export function ReviewScreen({ favorites, onBack, onToggleFavorite, onOpenArticle }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');
  const playback = usePlayer();

  const items = useMemo(() => {
    const list: FavItem[] = [];
    for (const article of loadArticles()) {
      article.vocab.forEach((v, index) => {
        const key = `vocab:${article.id}:${index}`;
        if (!favorites.has(key)) return;
        list.push({
          key,
          kind: 'vocab',
          article,
          en: v.en,
          lemma: v.lemma,
          subtitle: `${v.pos ?? ''}  ${v.zh}`.trim(),
          audio: v.audio,
        });
      });
      article.chunks.forEach((c, index) => {
        const key = `chunk:${article.id}:${index}`;
        if (!favorites.has(key)) return;
        list.push({
          key,
          kind: 'chunk',
          article,
          en: c.en,
          lemma: null,
          subtitle: c.zh,
          audio: c.audio,
        });
      });
    }
    return list;
  }, [favorites]);

  const filtered = items.filter(
    (item) =>
      filter === '全部' || (filter === '单词' ? item.kind === 'vocab' : item.kind === 'chunk'),
  );
  const vocabCount = items.filter((item) => item.kind === 'vocab').length;
  const chunkCount = items.length - vocabCount;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.back}>返回</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>复习收藏</Text>
      <Text style={styles.subtitle}>
        {vocabCount} 个单词 · {chunkCount} 个词块 · 点词条回到原文
      </Text>

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const active = item === filter;
          return (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, active && styles.filterOn]}
            >
              <Text style={[styles.filterText, active && styles.filterTextOn]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const active = playback.currentId === item.key;
          return (
            <View style={styles.row}>
              <TickPlayButton
                size={48}
                playing={active && playback.playing}
                progress={active ? playback.progress : 0}
                onPress={() => {
                  void player.toggle(item.key, item.audio, item.en);
                }}
              />
              <Pressable
                style={styles.rowBody}
                onPress={() => onOpenArticle(item.article.id, pickHighlight(item))}
              >
                <Text style={styles.en}>{item.en}</Text>
                <Text style={styles.zh}>{item.subtitle}</Text>
                <Text style={styles.source}>
                  {numberLabel(item.article.number)} · {item.article.title}
                </Text>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => onToggleFavorite(item.key)} style={styles.starBtn}>
                <Text style={styles.star}>★</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            还没有收藏。{'\n'}在文章的「词汇 / 词块」里点 ☆ 收藏，之后来这里复习。
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.blotter },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  backBtn: { minHeight: 44, justifyContent: 'center' },
  back: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  title: {
    paddingHorizontal: space.lg,
    marginTop: 2,
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    paddingHorizontal: space.lg,
    marginTop: 4,
    color: colors.mist,
    fontSize: 13,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.lg,
    marginTop: 14,
    marginBottom: 4,
  },
  filter: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterText: { color: colors.mist, fontSize: 14, fontWeight: '700' },
  filterTextOn: { color: colors.white },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowBody: { flex: 1 },
  en: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  zh: { marginTop: 3, color: colors.mist, fontSize: 14, lineHeight: 20 },
  source: { marginTop: 4, color: colors.second, fontSize: 12, fontWeight: '700' },
  starBtn: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 24, color: colors.second },
  empty: {
    marginTop: 48,
    textAlign: 'center',
    color: colors.mist,
    fontSize: 15,
    lineHeight: 24,
  },
});
