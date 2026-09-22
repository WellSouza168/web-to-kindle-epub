import JSZip from 'jszip';
import { ArticleMetadata, EpubOptions, ProcessedImage } from './types';
import { sanitizeToXhtml } from './xhtml-sanitizer';

/**
 * Monta o arquivo EPUB compatível com Kindle e retorna o Blob pronto para download.
 */
export async function generateKindleEpub(
  article: ArticleMetadata,
  options: EpubOptions,
  images: ProcessedImage[] = []
): Promise<Blob> {
  const zip = new JSZip();

  const bookId = `urn:uuid:web2kindle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const modifiedDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const nowFormatted = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());

  // 1. MIMETYPE (DEVE ser o primeiro arquivo e NÃO compactado)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.folder('META-INF')!.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS')!;

  // 3. OEBPS/style.css
  oebps.file('style.css', getKindleCss());

  // 4. Salvar imagens em OEBPS/images/
  if (options.includeImages) {
    const imagesFolder = oebps.folder('images')!;
    for (const img of images) {
      // img.internalPath é "images/image_1.jpg"
      const fileName = img.internalPath.replace(/^images\//, '');
      imagesFolder.file(fileName, img.data, { binary: true });
    }
  }

  // 5. OEBPS/cover.xhtml (Página de capa / frontispício elegante)
  if (options.addCoverPage) {
    oebps.file('cover.xhtml', buildCoverXhtml(article, options, nowFormatted));
  }

  // 6. OEBPS/article.xhtml (Corpo do artigo limpo e sanitizado)
  const cleanArticleBody = sanitizeToXhtml(article.contentHtml, {
    removeImages: !options.includeImages
  });
  oebps.file('article.xhtml', buildArticleXhtml(article, options, cleanArticleBody, nowFormatted));

  // 7. OEBPS/nav.xhtml (Navegação EPUB 3)
  oebps.file('nav.xhtml', buildNavXhtml(article, options));

  // 8. OEBPS/toc.ncx (Navegação EPUB 2 para compatibilidade legado do Kindle)
  oebps.file('toc.ncx', buildTocNcx(article, bookId));

  // 9. OEBPS/content.opf (Manifesto e metadados)
  oebps.file('content.opf', buildContentOpf(article, options, bookId, modifiedDate, images));

  // Gerar o Blob do ZIP final
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip'
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildCoverXhtml(article: ArticleMetadata, options: EpubOptions, dateStr: string): string {
  const title = escapeXml(options.title || article.title);
  const author = escapeXml(options.author || article.byline || article.siteName || 'Web Article');
  const site = escapeXml(article.siteName || new URL(article.url).hostname);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${options.language}" xml:lang="${options.language}">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="cover-body">
  <div class="cover-container">
    <div class="cover-badge">${site}</div>
    <h1 class="cover-title">${title}</h1>
    <div class="cover-divider">❖</div>
    <p class="cover-author">${author}</p>
    <p class="cover-date">${dateStr} • ${article.readingTimeMinutes} min de leitura</p>
  </div>
</body>
</html>`;
}

function buildArticleXhtml(
  article: ArticleMetadata,
  options: EpubOptions,
  cleanBody: string,
  dateStr: string
): string {
  const title = escapeXml(options.title || article.title);
  const author = escapeXml(options.author || article.byline || article.siteName || '');
  const site = escapeXml(article.siteName || new URL(article.url).hostname);
  const sourceUrl = escapeXml(article.url);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${options.language}" xml:lang="${options.language}">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <header class="article-header">
    <h1 class="article-title">${title}</h1>
    <div class="article-meta">
      ${author ? `<span>Por <strong>${author}</strong></span> • ` : ''}
      <span>Fonte: <a href="${sourceUrl}">${site}</a></span> • 
      <span>${dateStr}</span>
    </div>
  </header>
  <main class="article-content">
    ${cleanBody}
  </main>
  <footer class="article-footer">
    <hr/>
    <p class="source-note">Artigo original arquivado de <a href="${sourceUrl}">${sourceUrl}</a></p>
  </footer>
</body>
</html>`;
}

function buildNavXhtml(article: ArticleMetadata, options: EpubOptions): string {
  const title = escapeXml(options.title || article.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${options.language}" xml:lang="${options.language}">
<head>
  <title>Sumário</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h2>Sumário</h2>
    <ol>
      ${options.addCoverPage ? '<li><a href="cover.xhtml">Capa</a></li>' : ''}
      <li><a href="article.xhtml">${title}</a></li>
    </ol>
  </nav>
</body>
</html>`;
}

function buildTocNcx(article: ArticleMetadata, bookId: string): string {
  const title = escapeXml(article.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>${title}</text></navLabel>
      <content src="article.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
}

function buildContentOpf(
  article: ArticleMetadata,
  options: EpubOptions,
  bookId: string,
  modifiedDate: string,
  images: ProcessedImage[]
): string {
  const title = escapeXml(options.title || article.title);
  const author = escapeXml(options.author || article.byline || 'Web Article');

  // Manifest items
  const manifestItems: string[] = [
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
  ];

  if (options.addCoverPage) {
    manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
  }

  manifestItems.push('<item id="article" href="article.xhtml" media-type="application/xhtml+xml"/>');

  if (options.includeImages) {
    images.forEach((img, idx) => {
      const fileName = img.internalPath.replace(/^images\//, '');
      manifestItems.push(`<item id="img_${idx + 1}" href="images/${fileName}" media-type="${img.mediaType}"/>`);
    });
  }

  // Spine items
  const spineItems: string[] = [];
  if (options.addCoverPage) {
    spineItems.push('<itemref idref="cover"/>');
  }
  spineItems.push('<itemref idref="article"/>');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>${options.language}</dc:language>
    <dc:publisher>Web to Kindle Extension</dc:publisher>
    <meta property="dcterms:modified">${modifiedDate}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
}

function getKindleCss(): string {
  return `@charset "UTF-8";
body {
  margin: 4% 5%;
  font-family: "Bookerly", "Georgia", "Times New Roman", serif;
  line-height: 1.6;
  text-align: justify;
}

h1, h2, h3, h4, h5, h6 {
  font-family: sans-serif;
  font-weight: bold;
  line-height: 1.25;
  page-break-after: avoid;
  break-after: avoid;
  text-align: left;
}

h1 {
  font-size: 1.7em;
  margin-top: 1.2em;
  margin-bottom: 0.5em;
}

h2 {
  font-size: 1.35em;
  margin-top: 1.2em;
  margin-bottom: 0.4em;
}

h3 {
  font-size: 1.15em;
  margin-top: 1em;
  margin-bottom: 0.3em;
}

p {
  margin-top: 0;
  margin-bottom: 0.85em;
  text-indent: 0;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  page-break-inside: avoid;
  break-inside: avoid;
}

figure {
  margin: 1.5em 0;
  text-align: center;
}

figcaption {
  font-size: 0.85em;
  font-style: italic;
  color: #444;
  margin-top: 0.5em;
}

blockquote {
  margin: 1.2em 1.5em;
  padding-left: 1em;
  border-left: 3px solid #555;
  font-style: italic;
}

pre, code {
  font-family: "Consolas", "Courier New", monospace;
  font-size: 0.88em;
  background-color: #f2f2f2;
}

pre {
  padding: 0.8em;
  margin: 1em 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
}

th, td {
  border: 1px solid #999;
  padding: 0.4em 0.6em;
  text-align: left;
}

th {
  background-color: #f0f0f0;
}

a {
  color: #1a0dab;
  text-decoration: underline;
}

.article-header {
  border-bottom: 1px solid #999;
  padding-bottom: 1em;
  margin-bottom: 1.8em;
}

.article-title {
  margin-top: 0;
  margin-bottom: 0.4em;
}

.article-meta {
  font-size: 0.9em;
  font-style: italic;
  color: #555;
}

.article-footer {
  margin-top: 3em;
  font-size: 0.85em;
  color: #666;
}

.cover-body {
  margin: 0;
  padding: 0;
}

.cover-container {
  padding: 25% 10% 10% 10%;
  text-align: center;
  min-height: 80vh;
}

.cover-badge {
  display: inline-block;
  padding: 0.3em 0.8em;
  border: 1px solid #555;
  font-size: 0.85em;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 1.5em;
}

.cover-title {
  font-size: 2em;
  font-weight: bold;
  line-height: 1.25;
  margin: 0.5em 0;
}

.cover-divider {
  font-size: 1.4em;
  margin: 1.2em 0;
  color: #555;
}

.cover-author {
  font-size: 1.2em;
  font-style: italic;
  margin-bottom: 1.5em;
}

.cover-date {
  font-size: 0.85em;
  color: #666;
}
`;
}
