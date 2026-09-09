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

export type Sentence = {
  text: string;
  /** 句子在正文音频中的开始时间（毫秒） */
  start: number;
  /** 句子在正文音频中的结束时间（毫秒） */
  end: number;
};

export type Article = {
  id: string;
  number: number;
  title: string;
  body: string;
  translation: string;
  bodyAudio: string;
  sentences?: Sentence[];
  vocab: VocabItem[];
  chunks: ChunkItem[];
};

export type Route =
  | { name: 'home' }
  | { name: 'article'; id: string; highlight?: string; from?: 'home' | 'review' }
  | { name: 'review' };
