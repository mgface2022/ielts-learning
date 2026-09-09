import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
} from 'react-native';
import { ArticleScreen } from './src/screens/ArticleScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { findArticle } from './src/articles';
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

  useEffect(() => {
    // 文章页按系统返回键回列表，而不是退出 App
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'article') {
        setRoute({ name: 'home' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route]);

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
            // 返回列表不打断播放，音频继续在后台放，可从通知栏控制
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
