import { DetectedEdition, DetectedEditionArticle } from './types';

/**
 * Filtro e detector de edições de revistas / coletâneas de matérias.
 * Identifica quando a página atual é um sumário/índice editorial de uma edição
 * (ex: Superinteressante, Veja, Quatro Rodas, etc.) e extrai a lista estruturada de matérias.
 */
export function detectEditionArticles(doc: Document, pageUrl: string): DetectedEdition | null {
  const currentUrl = parseUrl(pageUrl);
  if (!currentUrl) return null;

  // 1. Seletores de elementos que devem ser ignorados (cabeçalhos do site, rodapés, menus, etc.)
  const noiseSelectors = [
    'body > header',
    '.site-header',
    '#site-header',
    'header.header',
    'nav',
    'footer',
    'aside',
    '.sidebar-above-footer',
    '.f-brands',
    '.new-footer-carousel',
    '.exp-menu-li',
    '.user-exp-row',
    '#user-exp-menu-wrapper',
    '.mobile-assine'
  ].join(', ');

  // 2. Extrair título da edição e subtítulo
  const siteName = extractSiteName(doc, currentUrl);
  const { editionTitle, editionSubtitle } = extractEditionTitles(doc, siteName);
  const coverImageUrl = extractEditionCoverUrl(doc, pageUrl);

  // 3. Procurar containers de matérias
  // Em páginas de revista como Superinteressante:
  // <section class="cards"> com múltiplos <div class="card ..."> ou <article>
  const candidateCards = Array.from(
    doc.querySelectorAll(
      '.edition-content .card, .cards .card, .category-list .card, .list .card, .list-item, article.card, article.post, main article, [role="main"] article, .card'
    )
  );

  const seenUrls = new Set<string>();
  const articles: DetectedEditionArticle[] = [];

  // Se encontramos cartões estruturados, processamos cada cartão
  if (candidateCards.length > 0) {
    let currentSectionHeader = '';

    candidateCards.forEach((card, index) => {
      // Verificar se este cartão está dentro de área de ruído
      if (card.closest(noiseSelectors)) return;

      // Verificar se há um cabeçalho de seção anterior imediato (ex: <h2 class="cards-title">Matérias</h2>)
      const prevHeading = findPrecedingSectionHeading(card);
      if (prevHeading) {
        currentSectionHeader = prevHeading;
      }

      const articleInfo = parseCard(card, pageUrl, currentUrl.hostname, currentSectionHeader, index);
      if (articleInfo && !seenUrls.has(articleInfo.url)) {
        seenUrls.add(articleInfo.url);
        articles.push(articleInfo);
      }
    });
  }

  // Se cartões específicos não renderam pelo menos 3 artigos, fazemos uma varredura geral
  // no conteúdo principal (<main>, #main, ou body ignorando ruído)
  if (articles.length < 3) {
    const mainContainer = doc.querySelector('main, #main, [role="main"], .main-container, .main-content') || doc.body;
    const allLinks = Array.from(mainContainer.querySelectorAll('a'));

    allLinks.forEach((link, index) => {
      // Ignorar ruído
      if (link.closest(noiseSelectors)) return;

      const href = link.getAttribute('href');
      if (!href) return;

      const fullUrl = resolveAbsoluteUrl(href, pageUrl);
      if (!fullUrl) return;

      if (!isValidArticleUrl(fullUrl, currentUrl)) return;
      if (seenUrls.has(fullUrl)) return;

      // Extrair título do link ou de heading interno
      const headingEl = link.querySelector('h1, h2, h3, h4, h5, [class*="title"]') || (link.parentElement?.tagName.match(/^H[1-4]$/) ? link.parentElement : null);
      const title = (headingEl?.textContent || link.textContent || '').trim().replace(/\s+/g, ' ');

      if (title.length < 15) return;
      if (isGenericOrNoiseText(title)) return;

      // Buscar possível thumbnail no link ou no elemento pai
      const imgEl = link.querySelector('img') || link.parentElement?.querySelector('img');
      const thumbnailUrl = imgEl ? getBestImageUrl(imgEl, pageUrl) : undefined;

      // Buscar possível autor ou descrição
      const parentCard = link.closest('.card, article, [class*="item"]');
      const byline = parentCard ? extractAuthorFromElement(parentCard) : undefined;
      const description = parentCard ? extractDescriptionFromElement(parentCard) : undefined;
      const section = parentCard ? extractSectionFromElement(parentCard) : undefined;

      seenUrls.add(fullUrl);
      articles.push({
        id: `ed_art_${index}_${Math.random().toString(36).substring(2, 7)}`,
        url: fullUrl,
        title,
        section,
        byline,
        description,
        thumbnailUrl,
        selected: true
      });
    });
  }

  // Uma edição precisa conter no mínimo 3 matérias editoriais
  if (articles.length < 3) {
    return null;
  }

  return {
    title: editionTitle,
    subtitle: editionSubtitle,
    siteName,
    coverImageUrl,
    pageUrl,
    articles
  };
}

/**
 * Analisa um cartão de artigo para extrair URL, Título, Autor, Resumo e Thumbnail.
 */
function parseCard(
  card: Element,
  pageUrl: string,
  targetHostname: string,
  sectionContext: string,
  index: number
): DetectedEditionArticle | null {
  let chosenLink: HTMLAnchorElement | null = null;
  let chosenTitle = '';

  // 1. Procurar heading específico no cartão (h1..h4 ou .title)
  const heading = card.querySelector('h1, h2, h3, h4, .title, [class*="title"], [class*="heading"]');
  if (heading) {
    const headingText = (heading.textContent || '').trim().replace(/\s+/g, ' ');
    const headingLink = (heading.closest('a') || heading.querySelector('a')) as HTMLAnchorElement | null;
    if (headingLink && headingText.length >= 10 && !isGenericOrNoiseText(headingText)) {
      const rawHref = headingLink.getAttribute('href');
      if (rawHref) {
        const articleUrl = resolveAbsoluteUrl(rawHref, pageUrl);
        if (articleUrl && isValidArticleUrl(articleUrl, new URL(pageUrl))) {
          chosenLink = headingLink;
          chosenTitle = headingText;
        }
      }
    }
  }

  // 2. Se não achou pelo heading, varrer links do cartão
  if (!chosenLink) {
    const links = Array.from(card.querySelectorAll('a'));
    for (const a of links) {
      // Ignorar explicitamente links que estão em badges de categoria ou autor
      if (a.closest('span.category, .post-category, span.author, .byline, [class*="author"], .tag, [class*="tag"]')) {
        continue;
      }

      const href = a.getAttribute('href');
      if (!href) continue;

      const fullUrl = resolveAbsoluteUrl(href, pageUrl);
      if (!fullUrl) continue;
      if (!isValidArticleUrl(fullUrl, new URL(pageUrl))) continue;

      const text = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (text.length >= 12 && !isGenericOrNoiseText(text)) {
        chosenLink = a as HTMLAnchorElement;
        chosenTitle = text;
        break;
      }
    }
  }

  if (!chosenLink || !chosenTitle) return null;

  const rawHref = chosenLink.getAttribute('href');
  if (!rawHref) return null;

  const articleUrl = resolveAbsoluteUrl(rawHref, pageUrl);
  if (!articleUrl) return null;

  const parsedArticleUrl = parseUrl(articleUrl);
  if (!parsedArticleUrl || parsedArticleUrl.hostname !== targetHostname) {
    return null;
  }

  // Extrair Seção/Categoria
  const cardSection = extractSectionFromElement(card) || sectionContext || undefined;

  // Extrair Autor
  const byline = extractAuthorFromElement(card);

  // Extrair Descrição
  const description = extractDescriptionFromElement(card);

  // Extrair Thumbnail
  const imgEl = card.querySelector('img');
  const thumbnailUrl = imgEl ? getBestImageUrl(imgEl, pageUrl) : undefined;

  return {
    id: `card_${index}_${Math.random().toString(36).substring(2, 7)}`,
    url: articleUrl,
    title: chosenTitle,
    section: cardSection,
    byline,
    description,
    thumbnailUrl,
    selected: true
  };
}

/**
 * Encontra cabeçalho de seção anterior ao cartão (ex: "Carta ao Leitor", "Matérias", "Supernovas")
 */
function findPrecedingSectionHeading(card: Element): string | null {
  let prev = card.previousElementSibling;
  while (prev) {
    if (prev.matches('h1, h2, h3, [class*="cards-title"], [class*="section-title"]')) {
      const headingText = (prev.textContent || '').trim();
      if (headingText.length > 0) return headingText;
    }
    prev = prev.previousElementSibling;
  }
  return null;
}

/**
 * Extrai nome do autor da matéria dentro do cartão.
 */
function extractAuthorFromElement(el: Element): string | undefined {
  const authorEl = el.querySelector('.author, [class*="author"], [class*="byline"]');
  if (!authorEl) return undefined;

  let text = (authorEl.textContent || '').trim();
  // Remover prefixos comuns como "Por", "De", "By", etc.
  text = text.replace(/^por\s+/i, '').replace(/^de\s+/i, '').replace(/^by\s+/i, '').trim();
  // Se contiver pipe ou data (ex: "Rafael Battaglia | Publicado em 21 ago 2026"), pegar apenas o nome
  if (text.includes('|')) {
    text = text.split('|')[0].trim();
  }
  return text.length > 2 && text.length < 60 ? text : undefined;
}

/**
 * Extrai resumo / descrição da matéria dentro do cartão.
 */
function extractDescriptionFromElement(el: Element): string | undefined {
  const descEl = el.querySelector('.description, [class*="desc"], [class*="excerpt"], p');
  if (!descEl) return undefined;

  const text = (descEl.textContent || '').trim().replace(/\s+/g, ' ');
  return text.length > 15 ? text : undefined;
}

/**
 * Extrai categoria/editoria dentro do cartão.
 */
function extractSectionFromElement(el: Element): string | undefined {
  const catEl = el.querySelector('.category, [class*="category"], [class*="editoria"], [class*="secao"]');
  if (!catEl) return undefined;

  const text = (catEl.textContent || '').trim();
  return text.length > 2 && text.length < 40 ? text : undefined;
}

/**
 * Identifica a imagem de melhor qualidade de um elemento <img> (data-src, srcset ou src)
 */
function getBestImageUrl(img: Element, baseUrl: string): string | undefined {
  const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src');
  if (!dataSrc || dataSrc.startsWith('data:image/svg')) return undefined;

  return resolveAbsoluteUrl(dataSrc, baseUrl);
}

/**
 * Extrai títulos da edição (título principal e subtítulo/data).
 */
function extractEditionTitles(doc: Document, siteName: string): { editionTitle: string; editionSubtitle?: string } {
  // 1. Procurar em bloco específico de edição (ex: .edition .cover .number)
  const editionNumberEl = doc.querySelector('.edition .number, .edition-number, [class*="edition"] [class*="number"]');
  if (editionNumberEl) {
    const raw = (editionNumberEl.textContent || '').trim();
    if (raw) {
      // Ex: "Edição 490 - Agosto de 2026"
      if (raw.includes('-')) {
        const [edPart, datePart] = raw.split('-').map((s) => s.trim());
        return {
          editionTitle: `${siteName} – ${edPart}`,
          editionSubtitle: datePart
        };
      }
      return {
        editionTitle: `${siteName} – ${raw}`,
        editionSubtitle: 'Edição Completa'
      };
    }
  }

  // 2. Procurar em h1.list-title ou h1
  const h1 = doc.querySelector('h1.list-title, h1');
  const h1Text = (h1?.textContent || '').trim();

  // 3. Procurar em meta og:title ou <title>
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const docTitle = doc.title || '';

  const candidateTitle = ogTitle || h1Text || docTitle;
  // Limpar sufixos como "| Super", "- Superinteressante", "Edição do mês"
  let cleanTitle = candidateTitle
    .replace(/\|\s*Super/gi, '')
    .replace(/\|\s*Editora Abril/gi, '')
    .replace(/-\s*Superinteressante/gi, '')
    .trim();

  if (cleanTitle.toLowerCase() === 'edição do mês' && docTitle) {
    cleanTitle = docTitle.replace(/\|\s*Super/gi, '').trim();
  }

  return {
    editionTitle: cleanTitle.length > 3 ? `${siteName} – ${cleanTitle}` : `${siteName} – Edição Especial`,
    editionSubtitle: 'Edição Completa'
  };
}

/**
 * Extrai a URL da capa oficial da edição.
 */
function extractEditionCoverUrl(doc: Document, baseUrl: string): string | undefined {
  // 1. Bloco de capa da edição (.edition .cover img)
  const editionCoverImg = doc.querySelector('.edition .cover img, .edition img, [class*="cover"] img, [class*="capa"] img');
  if (editionCoverImg) {
    const url = getBestImageUrl(editionCoverImg, baseUrl);
    if (url) return url;
  }

  // 2. Preload de imagem em destaque
  const preloadImg = doc.querySelector('link[rel="preload"][as="image"]');
  if (preloadImg) {
    const href = preloadImg.getAttribute('href');
    if (href && (href.toLowerCase().includes('capa') || href.toLowerCase().includes('destaque') || href.toLowerCase().includes('cover'))) {
      const url = resolveAbsoluteUrl(href, baseUrl);
      if (url) return url;
    }
  }

  // 3. Meta og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) {
    return resolveAbsoluteUrl(ogImage, baseUrl);
  }

  return undefined;
}

/**
 * Extrai o nome do veículo (ex: "Superinteressante", "Veja", etc.)
 */
function extractSiteName(doc: Document, url: URL): string {
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSiteName && ogSiteName.trim().length > 0) {
    const name = ogSiteName.trim();
    if (name.toLowerCase() === 'super') return 'Superinteressante';
    return name;
  }

  const hostname = url.hostname.replace(/^www\./, '');
  if (hostname.includes('super.abril.com.br')) return 'Superinteressante';
  if (hostname.includes('veja.abril.com.br')) return 'Veja';
  if (hostname.includes('quatrorodas.abril.com.br')) return 'Quatro Rodas';
  if (hostname.includes('piaui.folha.uol.com.br')) return 'revista piauí';

  return hostname.split('.')[0].toUpperCase();
}

/**
 * Validação rigorosa de URLs de matérias (elimina páginas institucionais, tags, categorias, assine, etc.)
 */
function isValidArticleUrl(targetUrl: string, currentUrl: URL): boolean {
  try {
    const parsed = new URL(targetUrl);

    // Deve ser do mesmo domínio
    if (parsed.hostname !== currentUrl.hostname) return false;

    // Não pode ser a própria página atual
    const cleanCurrent = (currentUrl.origin + currentUrl.pathname).replace(/\/$/, '');
    const cleanTarget = (parsed.origin + parsed.pathname).replace(/\/$/, '');
    if (cleanTarget === cleanCurrent) return false;

    const path = parsed.pathname.toLowerCase();

    // Bloquear links não editoriais comuns
    const nonArticlePatterns = [
      /\/tag\//,
      /\/tags\//,
      /\/categoria\//,
      /\/category\//,
      /\/author\//,
      /\/autor\//,
      /\/assine\//,
      /\/assinatura\//,
      /\/ofertas\//,
      /\/superarquivo\/?$/,
      /\/edicao\/?$/,
      /\/edicoes\/?$/,
      /\/privacidade/,
      /\/termos/,
      /\/politica/,
      /\/contato/,
      /\/newsletter/,
      /\/login/,
      /\/logout/,
      /\/perfil/,
      /\/assinaturas/,
      /\/favoritos/,
      /\/senhas/,
      /\/wp-admin/,
      /\/wp-content/,
      /\/wp-json/,
      /\/feed/
    ];

    for (const pattern of nonArticlePatterns) {
      if (pattern.test(path)) return false;
    }

    // Para ser artigo, deve ter um path com pelo menos 2 segmentos (ex: /comportamento/terapia-como-escolher-a-sua/)
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Identifica textos genéricos que não são títulos de matérias reais.
 */
function isGenericOrNoiseText(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const genericList = [
    'leia mais',
    'saiba mais',
    'clique aqui',
    'veja mais',
    'assine',
    'assine já',
    'assine a super',
    'já sou assinante',
    'edição do mês',
    'todas as edições',
    'edições anteriores',
    'minha abril',
    'conteúdos salvos',
    'dados pessoais',
    'compartilhar',
    'menu'
  ];

  return genericList.includes(lower) || lower.length < 12;
}

function resolveAbsoluteUrl(relativeUrl: string, baseUrl: string): string | undefined {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return undefined;
  }
}

function parseUrl(urlStr: string): URL | null {
  try {
    return new URL(urlStr);
  } catch {
    return null;
  }
}
