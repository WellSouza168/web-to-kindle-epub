export interface ArticleMetadata {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  url: string;
  publishedTime?: string | null;
  readingTimeMinutes: number;
  wordCount: number;
  contentHtml: string;
  textContent: string;
}

export interface EpubOptions {
  title: string;
  author: string;
  includeImages: boolean;
  addCoverPage: boolean;
  language: string;
}

export interface ExtractionStatus {
  state: 'idle' | 'extracting' | 'ready' | 'generating' | 'success' | 'error';
  progressMessage?: string;
  errorMessage?: string;
}

export interface ProcessedImage {
  originalUrl: string;
  internalPath: string; // e.g. "images/img_1.jpg"
  mediaType: string;    // e.g. "image/jpeg"
  data: Uint8Array;
}

export type CoverTheme = 'passages-dark' | 'classic-light' | 'minimal-slate';

export interface BookCoverConfig {
  type: 'preset' | 'custom';
  presetTheme: CoverTheme;
  customImageDataUrl?: string;
}

export interface BookArticle {
  id: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  url: string;
  readingTimeMinutes: number;
  wordCount: number;
  contentHtml: string;
  savedAt: string;
}

export interface BookPublication {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  cover: BookCoverConfig;
  articles: BookArticle[];
  updatedAt: string;
}

