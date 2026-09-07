import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StatusBar as RNStatusBar, StyleSheet } from 'react-native';
import { ArticleScreen } from './src/screens/ArticleScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { findArticle } from './src/articles';
import { player } from './src/player';
import { loadLastId, loadLearned, saveLastId, saveLearned } from './src/storage';
import { colors } from './src/theme';
import type { Article, Route } from './src/types';

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [lastId, setLastId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLearned(await loadLearned());
      setLastId(await loadLastId());
    })();
  }, []);

  const openArticle = (article: Article) => {
    setRoute({ name: 'article', id: article.id });
    setLastId(article.id);
    void saveLastId(article.id);
  };

  const toggleLearned = (id: string) => {
    const next = new Set(learned);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLearned(next);
    void saveLearned(next);
  };

  const article = route.name === 'article' ? findArticle(route.id) : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {article ? (
        <ArticleScreen
          article={article}
          learned={learned.has(article.id)}
          onBack={() => {
            void player.stop();
            setRoute({ name: 'home' });
          }}
          onToggleLearned={() => toggleLearned(article.id)}
        />
      ) : (
        <HomeScreen learned={learned} lastId={lastId} onOpen={openArticle} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.blotter,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
  },
});
