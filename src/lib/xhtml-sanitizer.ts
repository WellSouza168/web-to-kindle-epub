/**
 * Sanitizador de HTML e conversor para XHTML estrito (exigido por leitores EPUB e Kindle).
 */

const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'noscript', 'form', 'input', 'button',
  'svg', 'canvas', 'object', 'embed', 'video', 'audio', 'track', 'source',
  'select', 'textarea', 'nav', 'footer', 'header'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'href', 'src', 'alt', 'title', 'id', 'class', 'colspan', 'rowspan'
]);

/**
 * Limpa o HTML do artigo e retorna um corpo serializado em XHTML válido.
 */
export function sanitizeToXhtml(rawHtml: string, options: { removeImages?: boolean } = {}): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const container = doc.body.firstElementChild || doc.body;

  // Limpeza recursiva dos elementos do DOM
  cleanElement(container, options);

  // Serializar para XHTML estrito usando XMLSerializer
  const serializer = new XMLSerializer();
  let xhtml = serializer.serializeToString(container);

  // Remover o wrapper <div> externo da serialização
  if (xhtml.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')) {
    xhtml = xhtml.substring('<div xmlns="http://www.w3.org/1999/xhtml">'.length, xhtml.length - '</div>'.length);
  } else if (xhtml.startsWith('<div>')) {
    xhtml = xhtml.substring('<div>'.length, xhtml.length - '</div>'.length);
  }

  // Garantir que entidades problemáticas sejam limpas
  xhtml = fixXmlEntities(xhtml);

  return xhtml.trim();
}

function cleanElement(el: Element, options: { removeImages?: boolean }): void {
  const children = Array.from(el.children);

  for (const child of children) {
    const tagName = child.tagName.toLowerCase();

    // Remover tags proibidas
    if (FORBIDDEN_TAGS.has(tagName)) {
      child.remove();
      continue;
    }

    // Remover disclaimers de anúncios e chamadas de newsletter
    if (isAdDisclaimerText(child.textContent || '') || isNewsletterPromptText(child.textContent || '')) {
      child.remove();
      continue;
    }

    // Remover parágrafos e elementos vazios residuais
    if ((tagName === 'p' || tagName === 'span') && !child.firstElementChild && (child.textContent || '').trim().length === 0) {
      child.remove();
      continue;
    }

    // Se for <aside>, converter para <div class="callout-box">
    if (tagName === 'aside') {
      const div = child.ownerDocument.createElement('div');
      div.className = 'callout-box';
      while (child.firstChild) {
        div.appendChild(child.firstChild);
      }
      child.parentNode?.replaceChild(div, child);
      cleanElement(div, options);
      continue;
    }

    // Detectar blocos de destaque / callouts e normalizar para class="callout-box"
    const isCallout =
      child.getAttribute('data-callout') === 'true' ||
      /\b(box|callout|destaque|infobox|sidebar|wp-block-group|quadro|saiba-mais|nota|glossario|curiosidade)\b/i.test(child.className || '');

    if (isCallout && (child.textContent || '').trim().length > 20) {
      child.className = 'callout-box';
      child.removeAttribute('data-callout');

      // Normalizar título interno do box (promover span/strong inicial para h4 com destaque)
      const first = child.firstElementChild;
      if (first) {
        const firstTag = first.tagName.toLowerCase();
        if (firstTag === 'span' || firstTag === 'strong' || firstTag === 'b') {
          const h4 = child.ownerDocument.createElement('h4');
          h4.className = 'callout-title';
          while (first.firstChild) {
            h4.appendChild(first.firstChild);
          }
          child.replaceChild(h4, first);
        } else if (firstTag.startsWith('h')) {
          first.classList.add('callout-title');
        }
      }
    } else if (child.className && child.className !== 'callout-box' && child.className !== 'callout-title') {
      child.removeAttribute('class');
    }

    // Remover imagens se solicitado
    if (options.removeImages && (tagName === 'img' || tagName === 'picture' || tagName === 'figure')) {
      child.remove();
      continue;
    }

    // Se for img e o src ainda for externo (http/https) ou vazio, remove para não quebrar no Kindle
    if (tagName === 'img') {
      const src = child.getAttribute('src');
      if (!src || src.startsWith('http://') || src.startsWith('https://')) {
        child.remove();
        continue;
      }
    }

    // Se for link, remover javascript: ou links vazios
    if (tagName === 'a') {
      const href = child.getAttribute('href');
      if (!href || href.startsWith('javascript:')) {
        // Substituir nó a por seu conteúdo de texto
        unwrapElement(child);
        continue;
      }
    }

    // Limpar atributos desnecessários ou inseguros
    const attrs = Array.from(child.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        child.removeAttribute(attr.name);
      }
    }

    // Recursão para os filhos
    cleanElement(child, options);
  }
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

/**
 * Garante que ampersands soltos sejam convertidos em &amp; para evitar erros de parser XML.
 */
function fixXmlEntities(xmlString: string): string {
  // Converte & solto que não faz parte de entidade válida para &amp;
  return xmlString.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

/**
 * Identifica frases e disclaimers publicitários injetados no meio do texto das matérias.
 */
export function isAdDisclaimerText(rawText: string): boolean {
  if (!rawText) return false;

  // Normalizar espaços e remover pontuações comuns nas extremidades (ex: "— Continua após a publicidade —")
  const text = rawText
    .trim()
    .toLowerCase()
    .replace(/^[-—–\[\(\s*]+|[-—–\]\)\s*.]+$/g, '')
    .trim();

  if (!text) return false;

  const exactDisclaimers = [
    'continua após a publicidade',
    'continua depois da publicidade',
    'continua após o anúncio',
    'continua depois do anúncio',
    'continua após a propaganda',
    'continua depois da propaganda',
    'publicidade',
    'anúncio',
    'anuncio',
    'propaganda',
    'advertisement',
    'sponsored',
    'conteúdo patrocinado'
  ];

  if (exactDisclaimers.includes(text)) {
    return true;
  }

  // Padrão flexível: "continua (após|depois) (da|de|a|o)? (publicidade|anúncio|propaganda)"
  if (/^continua\s+(após|depois)\s+(a|o|da|do)?\s*(publicidade|anúncio|anuncio|propaganda)/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Identifica textos, títulos e mensagens de confirmação de caixas de newsletter e captação de e-mails.
 */
export function isNewsletterPromptText(rawText: string): boolean {
  if (!rawText) return false;

  const text = rawText
    .trim()
    .toLowerCase()
    .replace(/^[-—–\[\(\s*!]+|[-—–\]\)\s*.!]+$/g, '')
    .trim();

  if (!text) return false;

  const exactPhrases = [
    'as mais lidas da semana',
    'as mais lidas',
    'inscreva-se aqui',
    'inscreva-se',
    'cadastre-se',
    'cadastro efetuado com sucesso',
    'inscrição realizada com sucesso',
    'receba nossa newsletter',
    'assine nossa newsletter',
    'assine a newsletter',
    'newsletter da super',
    'quem assina tem mais vantagens',
    'leia também no goread',
    'abril signature'
  ];

  if (exactPhrases.includes(text)) {
    return true;
  }

  // Padrões inequívocos de chamadas ou confirmações de newsletter e marketing de assinatura
  if (
    /você receberá nossas newsletters/i.test(text) ||
    /receberá nossas newsletters/i.test(text) ||
    /uma seleção das reportagens que mais bombaram/i.test(text) ||
    /reportagens que mais bombaram no site/i.test(text) ||
    /^receba as (principais|melhores) notícias/i.test(text) ||
    /receba diariamente no seu e-?mail/i.test(text) ||
    /baixe e leia as edições digitais/i.test(text) ||
    /leia todas as revistas em um só app/i.test(text) ||
    /conteúdo criado por especialistas/i.test(text) ||
    /acompanhe as publicações dos seus autores favoritos/i.test(text)
  ) {
    return true;
  }

  return false;
}

