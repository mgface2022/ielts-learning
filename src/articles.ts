import data from '../assets/articles.json';
import type { Article } from './types';

const articles = (data as { articles: Article[] }).articles;

export function loadArticles(): Article[] {
  return articles;
}

export function findArticle(id: string): Article | undefined {
  return articles.find((item) => item.id === id);
}

export function numberLabel(n: number): string {
  return String(n).padStart(2, '0');
}

export function searchArticles(list: Article[], query: string): Article[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    if (item.body.toLowerCase().includes(q)) return true;
    if (item.translation.includes(query.trim())) return true;
    if (numberLabel(item.number).includes(q) || String(item.number) === q) return true;
    return (
      item.vocab.some((v) => v.en.toLowerCase().includes(q) || v.zh.includes(query.trim())) ||
      item.chunks.some((c) => c.en.toLowerCase().includes(q) || c.zh.includes(query.trim()))
    );
  });
}
