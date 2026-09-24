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

    // 3. Desaninhar cascas/wrappers 'div' redundantes de CMSs modernos (G1, Gutenberg, etc.)
    // Evita que o Readability descarte parágrafos legítimos com links jornalísticos longos
    unwrapRedundantDivs(doc);

    // 4. Identificar e marcar blocos de destaque (callouts/asides/sidebars/boxes) antes da leitura
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

    // Extrair autor e resumo do documento íntegro antes que o Readability descarte cabeçalhos durante o parse
    const initialSite = extractHostname(pageUrl);
    const preExtractedAuthor = extractSmartAuthor(doc, null, initialSite);
    const preExtractedExcerpt = extractSmartExcerpt(doc, null);

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

    // Título, Autor, Resumo e Site
    const title = (parsed.title || doc.title || 'Artigo sem título').trim();
    const siteName = (parsed.siteName || initialSite).trim();
    
    // Priorizar autor humano real; fallback para parsed.byline se não for o nome da marca
    let byline = preExtractedAuthor;
    if (!byline && parsed.byline && !isBrandName(parsed.byline, siteName)) {
      byline = cleanAuthorText(parsed.byline, siteName);
    }
    const excerpt = (parsed.excerpt && parsed.excerpt.trim().length > 15)
      ? parsed.excerpt.trim()
      : preExtractedExcerpt;

    return {
      title,
      byline,
      siteName,
      excerpt,
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
    '.abril-newsletter',
    // Blocos de assinatura, paywalls e carrosséis institucionais (ex: Abril/Superinteressante)
    '.sidebar-above-footer',
    '[class*="sidebar-above-footer"]',
    '[class*="barra_assine"]',
    '[class*="assine-abril"]',
    '[class*="new-footer-carousel"]',
    '[class*="f-brands"]',
    '[class*="box-inf-capas"]',
    '[class*="goread"]',
    '[class*="clube-do-assinante"]'
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

/**
 * Desaninha wrappers <div> ou <section> redundantes gerados por CMSs modernos (Gutenberg, G1/Globo, Next.js).
 * Muitos CMSs encapsulam cada parágrafo individualmente em cascas como <div id="chunk-xxx"><div class="mc-column"><p>...</p></div></div>.
 * Quando um parágrafo contém links jornalísticos relativamente longos (ex: citações de outras matérias que ocupam >50% do parágrafo),
 * a função interna _cleanConditionally do Mozilla Readability avalia a densidade de links do <div> pai e o apaga por confundi-lo
 * com um bloco de links publicitários ou navegação de rodapé.
 * Ao "descascar" os wrappers redundantes, o <p> passa a ser filho direto do container do artigo, onde nunca é removido.
 */
function unwrapRedundantDivs(doc: Document): void {
  // Padrões de classes/IDs que NÃO devem ser desaninhados para não destruir a identidade
  // de sidebars, anúncios, rodapés ou carrosséis que o Readability precisa identificar e descartar
  const UNLIKELY_PATTERN = /sidebar|footer|header|menu|widget|carousel|banner|promo|ad[-_]|ads[-_]|assine|related|recommend|author-box/i;

  let changed = true;
  let iterations = 0;
  // Limite de iterações para evitar loops infinitos em DOMs anômalos
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    // Mirar APENAS em <div> estruturais/layout (nunca em <section>, <aside>, etc.)
    const divs = Array.from(doc.querySelectorAll('div'));
    for (const div of divs) {
      if (isProtectedElement(div, doc)) {
        continue;
      }

      // Se o div possui classes ou IDs de widgets/anúncios/sidebars, não desaninhar
      const classAndId = `${div.className || ''} ${div.id || ''}`;
      if (UNLIKELY_PATTERN.test(classAndId)) {
        continue;
      }

      // 1. Se o div estiver completamente vazio (sem filhos e sem texto), remove
      if (div.children.length === 0 && (!div.textContent || !div.textContent.trim())) {
        div.remove();
        changed = true;
        continue;
      }

      // 2. Se o div contiver apenas 1 elemento filho e nenhum texto substantivo órfão fora dele
      if (div.children.length === 1) {
        const child = div.firstElementChild!;

        // Verifica se há nós de texto soltos fora do elemento filho
        let hasOutsideText = false;
        for (const childNode of Array.from(div.childNodes)) {
          if (childNode !== child && childNode.nodeType === 3 /* Node.TEXT_NODE */) {
            if ((childNode.textContent || '').trim().length > 0) {
              hasOutsideText = true;
              break;
            }
          }
        }
        if (hasOutsideText) continue;

        const allowedTags = [
          'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
          'BLOCKQUOTE', 'DIV', 'FIGURE', 'UL', 'OL', 'PRE'
        ];
        if (allowedTags.includes(child.tagName)) {
          div.replaceWith(child);
          changed = true;
        }
      }
    }
  }
}

/**
 * Extrai o autor real / jornalista da matéria com filtros inteligentes de portais.
 * Resolve casos onde o Readability retorna null (ex: G1 .content-publication-data__from)
 * ou onde retorna a organização editorial em vez do autor (ex: "Super", "Globo", "Redação").
 */
function extractSmartAuthor(doc: Document, parsedByline: string | null, siteName: string): string | null {
  if (parsedByline && !isBrandName(parsedByline, siteName)) {
    const cleaned = cleanAuthorText(parsedByline, siteName);
    if (cleaned && !isBrandName(cleaned, siteName)) {
      return cleaned;
    }
  }

  const candidateSelectors = [
    '.content-publication-data__from',           // G1 / Globo
    '[itemprop="author"] [itemprop="name"]',     // Schema.org Microdata
    '[itemprop="author"]',
    '.author-name',                              // WordPress / CMSs
    '.author',                                   // Abril / Super / Veja
    '.c-byline__author',
    '.byline__author',
    '[class*="author-name"]',
    '[class*="autor__nome"]',
    '[class*="autor-nome"]',
    'meta[name="author"]',                       // Metatags HTML
    'meta[property="article:author"]',
    'meta[name="dc.creator"]',
    '.byline',
    '[class*="byline"]'
  ];

  for (const sel of candidateSelectors) {
    if (sel.startsWith('meta')) {
      const meta = doc.querySelector(sel);
      const val = meta?.getAttribute('content')?.trim();
      if (val && !isBrandName(val, siteName)) {
        const cleaned = cleanAuthorText(val, siteName);
        if (cleaned && !isBrandName(cleaned, siteName)) return cleaned;
      }
    } else {
      const el = doc.querySelector(sel);
      if (el) {
        const raw = (el.textContent || '').trim();
        const cleaned = cleanAuthorText(raw, siteName);
        if (cleaned && cleaned.length >= 3 && cleaned.length <= 150 && !isBrandName(cleaned, siteName)) {
          return cleaned;
        }
      }
    }
  }

  return parsedByline && !isBrandName(parsedByline, siteName) ? cleanAuthorText(parsedByline, siteName) : null;
}

function isBrandName(name: string, siteName: string): boolean {
  const norm = name.toLowerCase().trim();
  const siteNorm = siteName.toLowerCase().trim();
  const brands = [
    'super', 'superinteressante', 'g1', 'globo', 'globo.com', 'abril', 
    'redação', 'redacao', 'editoria', 'da redação', 'da redacao',
    'estadao', 'estadão', 'folha', 'uol', 'veja', 'exame'
  ];
  return brands.includes(norm) || norm === siteNorm;
}

function cleanAuthorText(text: string, _siteName?: string): string {
  if (!text) return '';
  let cleaned = text.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.split('|')[0].trim();
  cleaned = cleaned.replace(/\b\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s+\d{2,4}.*$/i, '');
  cleaned = cleaned.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}.*$/, '');
  cleaned = cleaned.replace(/\b\d{1,2}h\d{2}.*$/, '');
  cleaned = cleaned.replace(/^Por\s+/i, '');
  cleaned = cleaned.replace(/—\s*Brasília.*$/i, '');
  cleaned = cleaned.replace(/,\s*(?:g1|globo|super|veja|estadao|folha).*$/i, '');
  cleaned = cleaned.replace(/\s*,\s*$/, '');
  return cleaned.trim();
}

/**
 * Extrai o resumo / subtítulo / linha fina da matéria.
 * Caso o Readability não tenha capturado, busca em metatags e elementos de linha fina.
 */
function extractSmartExcerpt(doc: Document, parsedExcerpt: string | null): string | null {
  if (parsedExcerpt && parsedExcerpt.trim().length > 15) {
    return parsedExcerpt.trim();
  }

  const metaSelectors = [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]'
  ];

  for (const sel of metaSelectors) {
    const meta = doc.querySelector(sel);
    const val = meta?.getAttribute('content')?.trim();
    if (val && val.length > 20 && !val.includes('...') && !val.toLowerCase().startsWith('assine')) {
      return val;
    }
  }

  const elSelectors = [
    '.content-head__subtitle',
    '.subtitle',
    '[class*="sub-title"]',
    '[class*="subtitle"]',
    '.lead',
    '[class*="lead"]'
  ];

  for (const sel of elSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = (el.textContent || '').trim();
      if (val.length > 20 && val.length < 500) {
        return val;
      }
    }
  }

  return parsedExcerpt ? parsedExcerpt.trim() : null;
}

