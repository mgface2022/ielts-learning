import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loadArticles, numberLabel, searchArticles } from '../articles';
import { colors, space } from '../theme';
import type { Article } from '../types';

type Props = {
  learned: Set<string>;
  lastId: string | null;
  favoriteCount: number;
  onOpen: (article: Article) => void;
  onOpenReview: () => void;
};

// 行高固定，才能在打开 App 时精确滚动定位到上次学习的文章
const ROW_HEIGHT = 64;

export function HomeScreen({ learned, lastId, favoriteCount, onOpen, onOpenReview }: Props) {
  const articles = useMemo(() => loadArticles(), []);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => searchArticles(articles, query), [articles, query]);
  const last = articles.find((item) => item.id === lastId);
  const learnedCount = articles.filter((item) => learned.has(item.id)).length;
  // 打开 App 时列表直接定位到上次学习的那篇（仅首次挂载生效，搜索不受影响）
  const lastIndex = last ? articles.findIndex((item) => item.id === last.id) : -1;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>雅思词汇</Text>
        <Text style={styles.tagline}>阅读写作分册。听完、跟读、再看词。</Text>
        <View style={styles.strip}>
          <View style={styles.stripTrack}>
            <View
              style={[
                styles.stripFill,
                { width: `${Math.round((learnedCount / articles.length) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.stripLabel}>
            已学 {learnedCount} / {articles.length}
          </Text>
        </View>
        <View style={styles.cards}>
          {last ? (
            <Pressable
              onPress={() => onOpen(last)}
              style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
            >
              <Text style={styles.continueKicker}>接着听</Text>
              <Text style={styles.continueTitle} numberOfLines={1}>
                {numberLabel(last.number)}  {last.title}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onOpenReview}
            style={({ pressed }) => [styles.review, pressed && styles.pressed]}
          >
            <Text style={styles.reviewKicker}>复习</Text>
            <Text style={styles.reviewTitle}>★ {favoriteCount}</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜标题、单词、词块或中文"
          placeholderTextColor={colors.mist}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        initialScrollIndex={lastIndex > 0 ? lastIndex : undefined}
        getItemLayout={(_, index) => ({
          length: ROW_HEIGHT,
          offset: ROW_HEIGHT * index,
          index,
        })}
        renderItem={({ item }) => {
          const done = learned.has(item.id);
          return (
            <Pressable
              onPress={() => onOpen(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.num}>{numberLabel(item.number)}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[
                    item.vocab.length > 0 ? `${item.vocab.length} 词` : null,
                    item.chunks.length > 0 ? `${item.chunks.length} 词块` : null,
                    done ? '已学' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={[styles.dot, done && styles.dotOn]} />
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>没有匹配的课文</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.blotter },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  brand: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0,
  },
  tagline: {
    marginTop: 4,
    color: colors.mist,
    fontSize: 15,
    lineHeight: 22,
  },
  strip: { marginTop: 16 },
  stripTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  stripFill: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.second,
  },
  stripLabel: {
    marginTop: 6,
    color: colors.mist,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  cards: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  continue: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.ink,
    borderRadius: 16,
  },
  review: {
    minWidth: 96,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reviewKicker: {
    color: colors.mist,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  reviewTitle: {
    marginTop: 4,
    color: colors.second,
    fontSize: 17,
    fontWeight: '800',
  },
  continueKicker: {
    color: colors.second,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  continueTitle: {
    marginTop: 4,
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  search: {
    marginTop: 14,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 12,
  },
  num: {
    width: 36,
    color: colors.second,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rowBody: { flex: 1 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 3, color: colors.mist, fontSize: 13 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.mist,
  },
  dotOn: {
    backgroundColor: colors.second,
    borderColor: colors.second,
  },
  empty: { marginTop: 32, textAlign: 'center', color: colors.mist },
  pressed: { opacity: 0.72 },
});
