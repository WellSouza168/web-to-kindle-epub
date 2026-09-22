import { Readability } from '@mozilla/readability';
import { ArticleMetadata } from './types';

/**
 * Executa o Mozilla Readability sobre o HTML da página e extrai o artigo e metadados.
 */
export function extractArticleFromHtml(rawHtml: string, pageUrl: string): ArticleMetadata | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Ajustar base URL para resolver links relativos corretamente
  const baseEl = doc.createElement('base');
  baseEl.href = pageUrl;
  doc.head.appendChild(baseEl);

  // Identificar e marcar blocos de destaque (callouts/asides/sidebars/boxes) antes da leitura
  const calloutSelectors = 'aside, .box, [class*="box"], [class*="callout"], [class*="destaque"], [class*="infobox"], [class*="sidebar"], [class*="wp-block-group"], [class*="quadro"]';
  const candidates = doc.querySelectorAll(calloutSelectors);
  candidates.forEach((el) => {
    // Apenas se contiver texto substancial (> 25 caracteres) para ignorar widgets vazios
    if ((el.textContent || '').trim().length > 25) {
      el.setAttribute('data-callout', 'true');
    }
  });

  const reader = new Readability(doc, {
    charThreshold: 100,
    keepClasses: true
  });

  const parsed = reader.parse();
  if (!parsed || !parsed.content) {
    return null;
  }

  // Contagem de palavras e cálculo de tempo estimado de leitura
  const text = parsed.textContent || '';
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200)); // Média de 200 palavras por minuto

  // Título e Autor
  const title = (parsed.title || doc.title || 'Artigo sem título').trim();
  const byline = parsed.byline ? parsed.byline.trim() : null;
  const siteName = (parsed.siteName || extractHostname(pageUrl)).trim();

  return {
    title,
    byline,
    siteName,
    excerpt: parsed.excerpt ? parsed.excerpt.trim() : null,
    url: pageUrl,
    readingTimeMinutes,
    wordCount,
    contentHtml: parsed.content,
    textContent: text
  };
}

function extractHostname(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'Web';
  }
}
