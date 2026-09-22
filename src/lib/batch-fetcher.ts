import { ArticleMetadata, DetectedEditionArticle } from './types';
import { extractArticleFromHtml } from './readability';

/**
 * Faz o download e extração em lote de uma série de artigos selecionados de uma edição.
 * As requisições de HTML são delegadas ao background service worker para evitar restrições de CORS
 * e utilizar as credenciais de sessão do usuário no navegador.
 */
export async function fetchEditionArticlesBatch(
  articles: DetectedEditionArticle[],
  onProgress?: (current: number, total: number, articleTitle: string) => void
): Promise<ArticleMetadata[]> {
  const selectedArticles = articles.filter((a) => a.selected);
  const total = selectedArticles.length;
  const results: ArticleMetadata[] = [];

  for (let i = 0; i < total; i++) {
    const art = selectedArticles[i];
    onProgress?.(i + 1, total, art.title);

    try {
      const pageData = await fetchPageHtmlViaBackground(art.url);
      if (pageData && pageData.html) {
        const parsed = extractArticleFromHtml(pageData.html, pageData.url || art.url);
        if (parsed) {
          // Se o título detectado na edição for mais limpo ou específico, garantir coerência
          results.push({
            ...parsed,
            title: parsed.title || art.title,
            byline: parsed.byline || art.byline || null
          });
        } else {
          // Fallback caso o Readability falhe no artigo específico
          results.push(createFallbackArticle(art));
        }
      } else {
        results.push(createFallbackArticle(art));
      }
    } catch (err) {
      console.warn(`[Batch Fetcher] Falha ao baixar matéria: ${art.title} (${art.url})`, err);
      results.push(createFallbackArticle(art));
    }

    // Intervalo de cortesia de 200ms entre downloads para não sobrecarregar a rede
    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Faz o download da imagem da capa oficial da edição e converte em dataUrl para o livro.
 */
export async function fetchEditionCoverDataUrl(coverUrl: string): Promise<string | null> {
  if (!coverUrl) return null;

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: coverUrl }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      });

      if (response && response.success && response.base64) {
        return `data:${response.contentType || 'image/jpeg'};base64,${response.base64}`;
      }
    }
  } catch (err) {
    console.warn('[Batch Fetcher] Erro ao carregar capa da edição:', err);
  }

  return null;
}

/**
 * Solicita ao background worker o download do HTML bruto da página.
 */
async function fetchPageHtmlViaBackground(url: string): Promise<{ html: string; url: string } | null> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_PAGE_HTML', url }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          resolve(null);
        } else {
          resolve({ html: res.html, url: res.url || url });
        }
      });
    });
  }

  // Fallback para ambiente fora da extensão (ex: testes locais)
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    return { html, url: res.url || url };
  } catch {
    return null;
  }
}

/**
 * Cria artigo de contingência com os dados já extraídos do índice da edição
 * caso o download da página filha falhe temporariamente.
 */
function createFallbackArticle(art: DetectedEditionArticle): ArticleMetadata {
  const desc = art.description || 'Conteúdo da matéria disponível na edição impressa ou online.';
  return {
    title: art.title,
    byline: art.byline || null,
    siteName: null,
    excerpt: art.description || null,
    url: art.url,
    readingTimeMinutes: 3,
    wordCount: 300,
    contentHtml: `<p>${desc}</p><p><a href="${art.url}">Acesse a matéria original no site</a></p>`,
    textContent: desc
  };
}
