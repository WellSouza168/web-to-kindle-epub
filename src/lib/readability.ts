import { Readability } from '@mozilla/readability';
import { ArticleMetadata } from './types';
import { isAdDisclaimerText, isNewsletterPromptText } from './xhtml-sanitizer';

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

    // 2. Normalizar classes tipográficas que causam falso-positivo no Readability (ex: Tailwind font-extrabold)
    normalizeTypographyClasses(doc);

    // 3. Identificar e marcar blocos de destaque (callouts/asides/sidebars/boxes) antes da leitura
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
  // 1. Containers com classes de publicidade específicas, widgets de stories e mini-matérias
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
    '[class*="banner-publicidade"]',
    // Web Stories e widgets interativos que deixam títulos órfãos no artigo
    '.abril-web-story-embed',
    '[class*="web-story"]',
    '[class*="web-stories"]',
    '[class*="webstories"]',
    '[data-web-story]',
    '[data-web-story-lazy]',
    '[data-web-story-state]',
    'amp-story-player',
    'amp-story',
    '.wp-block-web-stories-embed',
    '[class*="story-player"]',
    // Blocos inline de matérias recomendadas / links de engajamento cruzado
    '.materia-relacionada',
    '[class*="materia-relacionada"]',
    '[class*="materias-relacionadas"]',
    '[class*="inline-related"]',
    '[class*="box-relacionadas"]',
    '.leia-tambem',
    '[class*="leia-tambem"]',
    '.veja-mais',
    '[class*="veja-mais"]',
    // Boxes de inscrição em newsletters e captação de e-mails
    '[class*="newsletter"]',
    '[id*="newsletter"]',
    '[class*="lead-capture"]',
    '[class*="leadbox"]',
    '[class*="lead-box"]',
    '[class*="inscreva-se"]',
    '[class*="inscricao-newsletter"]',
    '[class*="signup-box"]',
    '[class*="boletim"]',
    '[class*="boletins"]',
    '[class*="news-box"]',
    '.box-newsletter',
    '.block-newsletter',
    '.abril-newsletter'
  ].join(', ');

  doc.querySelectorAll(adSelectors).forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    el.remove();
  });

  // 2. Containers de mídia interativa (iframes/video/embed) cuja única finalidade era exibir widget de story/recomendação
  const embedContainers = doc.querySelectorAll('div, section, aside, figure');
  embedContainers.forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    const hasMedia = el.querySelector('iframe, amp-story-player, amp-story, [class*="web-story"]');
    if (hasMedia) {
      // Se não contiver parágrafos de texto substantivos do artigo (> 100 caracteres)
      const paragraphs = Array.from(el.querySelectorAll('p')).filter(
        (p) => (p.textContent || '').trim().length > 100
      );
      if (paragraphs.length === 0) {
        const className = el.className || '';
        if (
          /embed|story|widget|relacionad|cross-promo/i.test(className) ||
          el.hasAttribute('data-web-story') ||
          el.querySelector('[class*="story"], [class*="embed"]')
        ) {
          el.remove();
        }
      }
    }
  });

  // 3. Elementos pré-carregados ocultos no DOM (mensagens de feedback tipo "Cadastro efetuado com sucesso!")
  const hiddenElements = doc.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]');
  hiddenElements.forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    el.remove();
  });

  // 4. Elementos que contenham texto de aviso publicitário ou chamadas de newsletter
  const textCandidates = doc.querySelectorAll('p, span, div, small, em, strong, h3, h4, h5, h6');
  textCandidates.forEach((el) => {
    if (isProtectedElement(el, doc)) return;
    const text = el.textContent || '';
    if (isAdDisclaimerText(text)) {
      el.remove();
    } else if (isNewsletterPromptText(text)) {
      // Se for o container pai do card de newsletter, remove o card inteiro
      const parent = el.closest('[class*="newsletter"], [class*="card"], [class*="block"], div');
      if (parent && !isProtectedElement(parent, doc) && (parent.textContent || '').length < 400) {
        parent.remove();
      } else {
        el.remove();
      }
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

/**
 * Normaliza classes CSS tipográficas que causam falso-positivo no Mozilla Readability.
 * O Readability remove qualquer elemento cujo nome de classe contenha a substring "extra"
 * (pensado originalmente para widgets/anúncios extras), o que acaba deletando títulos legítimos
 * que usem classes do Tailwind ou CSS moderno como "font-extrabold" ou "font-extralight".
 */
function normalizeTypographyClasses(doc: Document): void {
  const typographyRegex = /\b((?:font-)?extra[-_]?(?:bold|light|black|thin)|(?:text-)?extra[-_]?(?:large|small))\b/gi;

  const elementsWithClasses = doc.querySelectorAll('[class*="extra"], [class*="Extra"]');
  elementsWithClasses.forEach((el) => {
    const originalClass = el.getAttribute('class');
    if (originalClass && typographyRegex.test(originalClass)) {
      const normalized = originalClass.replace(typographyRegex, (match) => {
        if (/bold/i.test(match)) {
          return match.toLowerCase().startsWith('font-') ? 'font-bold' : 'bold';
        }
        if (/light/i.test(match)) {
          return match.toLowerCase().startsWith('font-') ? 'font-normal' : 'normal';
        }
        return '';
      });
      el.setAttribute('class', normalized.trim());
    }
  });
}

