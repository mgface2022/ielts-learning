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
  onOpen: (article: Article) => void;
};

export function HomeScreen({ learned, lastId, onOpen }: Props) {
  const articles = useMemo(() => loadArticles(), []);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => searchArticles(articles, query), [articles, query]);
  const last = articles.find((item) => item.id === lastId);
  const learnedCount = articles.filter((item) => learned.has(item.id)).length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>60s</Text>
        <Text style={styles.tagline}>一篇大约一分钟。听完、跟读、再看词。</Text>
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
        {last ? (
          <Pressable onPress={() => onOpen(last)} style={({ pressed }) => [styles.continue, pressed && styles.pressed]}>
            <Text style={styles.continueKicker}>接着听</Text>
            <Text style={styles.continueTitle}>
              {numberLabel(last.number)}  {last.title}
            </Text>
          </Pressable>
        ) : null}
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
        renderItem={({ item }) => {
          const done = learned.has(item.id);
          return (
            <Pressable
              onPress={() => onOpen(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.num}>{numberLabel(item.number)}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.vocab.length} 词 · {item.chunks.length} 词块
                  {done ? ' · 已学' : ''}
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
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.4,
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
  continue: {
    marginTop: 14,
    padding: 14,
    backgroundColor: colors.ink,
    borderRadius: 16,
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
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
