import AsyncStorage from '@react-native-async-storage/async-storage';

const LEARNED_KEY = 'sixty.learned';
const LAST_KEY = 'sixty.lastId';
const FAVORITES_KEY = 'sixty.favorites';

export async function loadLearned(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(LEARNED_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function saveLearned(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify([...ids]));
}

export async function loadLastId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_KEY);
}

export async function saveLastId(id: string): Promise<void> {
  await AsyncStorage.setItem(LAST_KEY, id);
}

export async function loadFavorites(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function saveFavorites(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
}
