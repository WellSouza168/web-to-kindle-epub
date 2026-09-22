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
      /\b(callout|destaque|box-materia|infobox|wp-block-group|box-destaque|box_destaque|sidebar-box)\b/i.test(child.className || '');

    if (isCallout && (child.textContent || '').trim().length > 30) {
      child.className = 'callout-box';
      child.removeAttribute('data-callout');
    } else if (child.className && child.className !== 'callout-box') {
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
