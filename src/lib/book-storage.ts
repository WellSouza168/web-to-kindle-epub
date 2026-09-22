import { ArticleMetadata, BookArticle, BookPublication } from './types';

const STORAGE_KEY = 'web2kindle_current_publication';

export const DEFAULT_PUBLICATION: BookPublication = {
  id: 'current_draft',
  title: 'Minha Revista',
  subtitle: 'Coletânea de Artigos',
  author: 'Edição Especial',
  cover: {
    type: 'preset',
    presetTheme: 'passages-dark'
  },
  articles: [],
  updatedAt: new Date().toISOString()
};

/**
 * Carrega a publicação atual do armazenamento persistente do Chrome.
 */
export async function loadPublication(): Promise<BookPublication> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    // Fallback para localStorage fora da extensão
    const local = localStorage.getItem(STORAGE_KEY);
    return local ? JSON.parse(local) : DEFAULT_PUBLICATION;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const data = result[STORAGE_KEY];
      if (data && Array.isArray(data.articles)) {
        updateBadge(data.articles.length);
        resolve(data);
      } else {
        updateBadge(0);
        resolve(DEFAULT_PUBLICATION);
      }
    });
  });
}

/**
 * Salva a publicação e atualiza o badge do ícone da extensão.
 */
export async function savePublication(pub: BookPublication): Promise<void> {
  pub.updatedAt = new Date().toISOString();

  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pub));
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: pub }, () => {
      updateBadge(pub.articles.length);
      resolve();
    });
  });
}

/**
 * Adiciona um artigo à coletânea atual.
 */
export async function addArticleToPublication(article: ArticleMetadata): Promise<BookPublication> {
  const pub = await loadPublication();

  // Se for o primeiro artigo e o título ainda for o padrão, sugere o nome do site/assunto
  if (pub.articles.length === 0 && pub.title === DEFAULT_PUBLICATION.title) {
    pub.title = article.siteName || 'Minha Revista';
    pub.subtitle = 'Artigos Selecionados';
  }

  const newArticle: BookArticle = {
    id: `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: article.title,
    byline: article.byline,
    siteName: article.siteName,
    excerpt: article.excerpt,
    url: article.url,
    readingTimeMinutes: article.readingTimeMinutes,
    wordCount: article.wordCount,
    contentHtml: article.contentHtml,
    savedAt: new Date().toISOString()
  };

  pub.articles.push(newArticle);
  await savePublication(pub);
  return pub;
}

/**
 * Remove um artigo da coletânea.
 */
export async function removeArticleFromPublication(articleId: string): Promise<BookPublication> {
  const pub = await loadPublication();
  pub.articles = pub.articles.filter((a) => a.id !== articleId);
  await savePublication(pub);
  return pub;
}

/**
 * Reordena artigos na coletânea (mover para cima ou para baixo).
 */
export async function reorderArticlesInPublication(
  fromIndex: number,
  toIndex: number
): Promise<BookPublication> {
  const pub = await loadPublication();
  if (fromIndex < 0 || fromIndex >= pub.articles.length || toIndex < 0 || toIndex >= pub.articles.length) {
    return pub;
  }

  const [movedItem] = pub.articles.splice(fromIndex, 1);
  pub.articles.splice(toIndex, 0, movedItem);

  await savePublication(pub);
  return pub;
}

/**
 * Importa uma edição inteira de revista para o livro, configurando título, subtítulo,
 * capa oficial (se disponível) e todos os artigos como capítulos.
 */
export async function importEditionToPublication(
  editionTitle: string,
  editionSubtitle: string,
  author: string,
  coverDataUrl: string | undefined,
  articles: ArticleMetadata[]
): Promise<BookPublication> {
  const pub = await loadPublication();

  pub.title = editionTitle;
  pub.subtitle = editionSubtitle;
  pub.author = author;

  if (coverDataUrl) {
    pub.cover = {
      type: 'custom',
      presetTheme: pub.cover.presetTheme || 'passages-dark',
      customImageDataUrl: coverDataUrl
    };
  }

  // Converter e adicionar todos os artigos
  const newArticles: BookArticle[] = articles.map((article, idx) => ({
    id: `art_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    title: article.title,
    byline: article.byline,
    siteName: article.siteName,
    excerpt: article.excerpt,
    url: article.url,
    readingTimeMinutes: article.readingTimeMinutes,
    wordCount: article.wordCount,
    contentHtml: article.contentHtml,
    savedAt: new Date().toISOString()
  }));

  pub.articles = newArticles;
  await savePublication(pub);
  return pub;
}

/**
 * Limpa todos os artigos da coletânea e reseta para um novo rascunho.
 */
export async function clearPublication(): Promise<BookPublication> {
  const resetPub: BookPublication = {
    ...DEFAULT_PUBLICATION,
    id: `pub_${Date.now()}`,
    updatedAt: new Date().toISOString()
  };
  await savePublication(resetPub);
  return resetPub;
}

/**
 * Atualiza o indicador numérico no ícone da extensão.
 */
export function updateBadge(count: number): void {
  if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count > 0 && chrome.action.setBadgeBackgroundColor) {
      chrome.action.setBadgeBackgroundColor({ color: '#D97706' }); // Tom âmbar/laranja
    }
  }
}
