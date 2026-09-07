export type VocabItem = {
  en: string;
  pos: string | null;
  lemma: string | null;
  zh: string;
  audio: string;
};

export type ChunkItem = {
  en: string;
  zh: string;
  audio: string;
};

export type Article = {
  id: string;
  number: number;
  title: string;
  body: string;
  translation: string;
  bodyAudio: string;
  vocab: VocabItem[];
  chunks: ChunkItem[];
};

export type Route =
  | { name: 'home' }
  | { name: 'article'; id: string };
