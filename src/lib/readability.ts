import { Readability } from '@mozilla/readability';
import { ArticleMetadata } from './types';
import { isAdDisclaimerText } from './xhtml-sanitizer';

/**
 * Executa o Mozilla Readability sobre o HTML da página e extrai o artigo e metadados.
 */
export function extractArticleFromHtml(rawHtml: string, pageUrl: string): ArticleMetadata | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    if (!doc || !doc.documentElement || !doc.body) {
      return null;
    }

    // Ajustar base URL para resolver links relativos corretamente
    if (doc.head) {
      const baseEl = doc.createElement('base');
      baseEl.href = pageUrl;
      doc.head.appendChild(baseEl);
    }

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

    if (!doc.documentElement || !doc.body) {
      return null;
    }

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
  } catch (err) {
    console.warn('[Readability] Falha ao extrair artigo:', err);
    return null;
  }
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
 * Remove blocos de propaganda, widgets de assinatura e disclaimers publicitários do documento
 * sem remover acidentalmente tags estruturais vitais (html, head, body, article, main).
 */
function stripAdElements(doc: Document): void {
  // 1. Containers com classes de publicidade específicas e seguras
  const adSelectors = [
    '.ad-container',
    '.ads-container',
    '.advertisement',
    '.adsbox',
    '.ad-banner',
    '.ads-bilboards',
    '.fixed-ad',
    '.post-ads',
    '.mobile-assine',
    '.login-assine',
    '.injected-paywall',
    '[data-ad]',
    '[data-ad-slot]',
    '[data-ad-unit]',
    '[id*="google_ads"]',
    '[id*="taboola"]',
    '[id*="outbrain"]',
    '.publicidade',
    '[class*="banner-publicidade"]'
  ].join(', ');

  doc.querySelectorAll(adSelectors).forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    el.remove();
  });

  // 2. Elementos que contenham texto de aviso publicitário (ex: "Continua após a publicidade")
  const textCandidates = doc.querySelectorAll('p, span, div, small, em, strong');
  textCandidates.forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    if (isAdDisclaimerText(el.textContent || '')) {
      el.remove();
    }
  });
}

function isProtectedElement(el: Element, doc: Document): boolean {
  if (
    el === doc.documentElement ||
    el === doc.body ||
    el === doc.head ||
    el.contains(doc.body) ||
    el.matches('html, body, head, article, main, #main, [role="main"], [data-callout="true"]')
  ) {
    return true;
  }
  return false;
}
