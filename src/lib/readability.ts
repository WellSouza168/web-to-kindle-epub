import { Readability } from '@mozilla/readability';
import { ArticleMetadata } from './types';
import { isAdDisclaimerText } from './xhtml-sanitizer';

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

  // 1. Remover containers publicitários e disclaimers (ex: "Continua após a publicidade")
  stripAdElements(doc);

  // 2. Identificar e marcar blocos de destaque (callouts/asides/sidebars/boxes) antes da leitura
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

/**
 * Remove blocos de propaganda, widgets de assinatura e disclaimers publicitários do documento.
 */
function stripAdElements(doc: Document): void {
  // 1. Containers com classes de publicidade conhecidas
  const adSelectors = [
    '.ads',
    '.ad',
    '[class*="ads-"]',
    '[class*="-ads"]',
    '[class*="publicidade"]',
    '[class*="anuncio"]',
    '.ads-bilboards',
    '.fixed-ad',
    '.post-ads',
    '.mobile-assine',
    '.login-assine',
    '.injected-paywall'
  ].join(', ');

  doc.querySelectorAll(adSelectors).forEach((el) => {
    // Preservar containers raiz do artigo ou blocos editoriais já marcados
    if (!el.matches('article, main, #main, [data-callout="true"]')) {
      el.remove();
    }
  });

  // 2. Elementos que contenham texto de aviso publicitário (ex: "Continua após a publicidade")
  const textCandidates = doc.querySelectorAll('p, span, div, small, em, strong');
  textCandidates.forEach((el) => {
    if (isAdDisclaimerText(el.textContent || '')) {
      el.remove();
    }
  });
}
