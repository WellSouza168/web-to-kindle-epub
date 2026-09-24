import JSZip from 'jszip';
import { ArticleMetadata, BookPublication, EpubOptions, ProcessedImage } from './types';
import { sanitizeToXhtml } from './xhtml-sanitizer';
import { extractAndProcessImages } from './image-fetcher';

/**
 * Monta o arquivo EPUB para um artigo individual compatível com Kindle.
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

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });
}

/**
 * Monta um LIVRO COMPLETO / REVISTA (Estilo Passages) com múltiplos artigos divididos em capítulos,
 * capa dedicada de alta resolução (reconhecida pelo Kindle) e sumário navegável.
 */
export async function generatePublicationEpub(
  publication: BookPublication,
  coverImageData: Uint8Array,
  options: { includeImages: boolean },
  onProgress?: (current: number, total: number, message: string) => void
): Promise<Blob> {
  const zip = new JSZip();

  const bookId = `urn:uuid:pub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const modifiedDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const totalArticles = publication.articles.length;

  // 1. MIMETYPE (Obrigatório ser o 1º arquivo e uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.folder('META-INF')!.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS')!;
  oebps.file('style.css', getKindleCss());

  // 3. Salvar imagem da capa em OEBPS/images/cover.jpg
  const imagesFolder = oebps.folder('images')!;
  imagesFolder.file('cover.jpg', coverImageData, { binary: true });

  // 4. Processar capítulos e imagens
  const allImages: ProcessedImage[] = [];
  const processedChapters: { filename: string; title: string; html: string }[] = [];
  const sharedImagesMap = new Map<string, string>(); // url original -> internalPath compartilhado

  for (let idx = 0; idx < totalArticles; idx++) {
    const art = publication.articles[idx];
    const chapterNum = String(idx + 1).padStart(2, '0');
    const chapterFilename = `chapter_${chapterNum}.xhtml`;

    onProgress?.(idx + 1, totalArticles, `Processando capítulo ${idx + 1} de ${totalArticles}: "${art.title}"`);

    let chapterHtml = art.contentHtml;

    if (options.includeImages) {
      try {
        const imgResult = await extractAndProcessImages(art.contentHtml, art.url);
        // Utilizar o HTML com imagens locais atualizadas
        chapterHtml = imgResult.updatedHtml;
        // Prefixar imagens para evitar colisões entre capítulos com desduplicação inteligente
        for (const img of imgResult.images) {
          // Se esta mesma imagem (por URL original) já foi salva em outro capítulo, reutiliza
          if (sharedImagesMap.has(img.originalUrl)) {
            const existingPath = sharedImagesMap.get(img.originalUrl)!;
            chapterHtml = chapterHtml.split(img.internalPath).join(existingPath);
            continue;
          }

          const uniquePath = `images/c${chapterNum}_${img.internalPath.replace(/^images\//, '')}`;
          sharedImagesMap.set(img.originalUrl, uniquePath);
          chapterHtml = chapterHtml.split(img.internalPath).join(uniquePath);
          const uniqueImg: ProcessedImage = {
            ...img,
            internalPath: uniquePath
          };
          allImages.push(uniqueImg);
          const fileName = uniquePath.replace(/^images\//, '');
          imagesFolder.file(fileName, uniqueImg.data, { binary: true });
        }
      } catch {
        // Se falhar nas imagens de um artigo, prossegue com o texto
      }
    }

    const cleanXhtml = sanitizeToXhtml(chapterHtml, {
      removeImages: !options.includeImages
    });

    const chapterFileContent = buildChapterXhtml(art, idx + 1, cleanXhtml);
    oebps.file(chapterFilename, chapterFileContent);

    processedChapters.push({
      filename: chapterFilename,
      title: art.title,
      html: chapterFileContent
    });
  }

  // 5. OEBPS/cover.xhtml (Página visual da capa com imagem)
  oebps.file('cover.xhtml', buildPublicationCoverPage(publication));

  // 6. OEBPS/nav.xhtml (Sumário EPUB 3 com todos os capítulos)
  oebps.file('nav.xhtml', buildPublicationNavXhtml(publication, processedChapters));

  // 7. OEBPS/toc.ncx (Sumário EPUB 2 para marcadores de capítulo no Kindle)
  oebps.file('toc.ncx', buildPublicationTocNcx(publication, processedChapters, bookId));

  // 8. OEBPS/content.opf (Manifesto com propriedades de capa cover-image)
  oebps.file('content.opf', buildPublicationContentOpf(
    publication,
    processedChapters,
    allImages,
    bookId,
    modifiedDate
  ));

  onProgress?.(totalArticles, totalArticles, 'Compactando arquivo final EPUB para o Kindle...');

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ==================== BUILDERS PARA ARTIGO AVULSO ==================== */

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

/* ==================== BUILDERS PARA LIVRO / REVISTA ==================== */

function buildPublicationCoverPage(pub: BookPublication): string {
  const title = escapeXml(pub.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
  <style type="text/css">
    body.cover-page {
      margin: 0;
      padding: 0;
      text-align: center;
    }
    .cover-img {
      max-height: 100vh;
      max-width: 100vw;
      width: auto;
      height: auto;
      margin: 0 auto;
      display: block;
    }
  </style>
</head>
<body class="cover-page">
  <div>
    <img src="images/cover.jpg" alt="${title}" class="cover-img"/>
  </div>
</body>
</html>`;
}

function buildChapterXhtml(art: any, chapterNumber: number, cleanBody: string): string {
  const numStr = String(chapterNumber).padStart(2, '0');
  const title = escapeXml(art.title);
  const author = escapeXml(art.byline || art.siteName || '');
  const site = escapeXml(art.siteName || 'Web');
  const url = escapeXml(art.url);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>${numStr}. ${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="chapter-header">
    <div class="chapter-number">CAPÍTULO ${numStr}</div>
    <h1 class="chapter-title">${title}</h1>
    <div class="chapter-meta">
      ${author ? `<span>${author}</span> • ` : ''}
      <span>Fonte: <a href="${url}">${site}</a></span> • 
      <span>${art.readingTimeMinutes} min de leitura</span>
    </div>
  </div>
  <main class="article-content">
    ${cleanBody}
  </main>
  <footer class="chapter-footer">
    <hr/>
    <p class="source-note">Artigo original arquivado de <a href="${url}">${url}</a></p>
  </footer>
</body>
</html>`;
}

function buildPublicationNavXhtml(pub: BookPublication, chapters: { filename: string; title: string }[]): string {
  const title = escapeXml(pub.title);
  const subtitle = escapeXml(pub.subtitle);

  const listItems = chapters.map((ch, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return `<li><a href="${ch.filename}"><span class="toc-num">${num}.</span> ${escapeXml(ch.title)}</a></li>`;
  }).join('\n      ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>Sumário - ${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc" class="toc-container">
    <div class="toc-header">
      <h1 class="toc-title">${title}</h1>
      ${subtitle ? `<p class="toc-subtitle">${subtitle}</p>` : ''}
      <hr/>
      <h2 class="toc-heading">Índice de Capítulos</h2>
    </div>
    <ol class="toc-list">
      ${listItems}
    </ol>
  </nav>
</body>
</html>`;
}

function buildPublicationTocNcx(
  pub: BookPublication,
  chapters: { filename: string; title: string }[],
  bookId: string
): string {
  const title = escapeXml(pub.title);
  const author = escapeXml(pub.author || 'Passages Collection');

  const navPoints = chapters.map((ch, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return `
    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${num}. ${escapeXml(ch.title)}</text></navLabel>
      <content src="${ch.filename}"/>
    </navPoint>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <docAuthor><text>${author}</text></docAuthor>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
}

function buildPublicationContentOpf(
  pub: BookPublication,
  chapters: { filename: string; title: string }[],
  images: ProcessedImage[],
  bookId: string,
  modifiedDate: string
): string {
  const title = escapeXml(pub.title);
  const author = escapeXml(pub.author || 'Passages Collection');

  const manifestItems: string[] = [
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    // Capa do Kindle como cover-image
    '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
    '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'
  ];

  chapters.forEach((ch, idx) => {
    manifestItems.push(`<item id="chapter_${idx + 1}" href="${ch.filename}" media-type="application/xhtml+xml"/>`);
  });

  images.forEach((img, idx) => {
    const fileName = img.internalPath.replace(/^images\//, '');
    manifestItems.push(`<item id="img_${idx + 1}" href="images/${fileName}" media-type="${img.mediaType}"/>`);
  });

  const spineItems: string[] = [
    '<itemref idref="cover"/>',
    '<itemref idref="nav"/>'
  ];

  chapters.forEach((_ch, idx) => {
    spineItems.push(`<itemref idref="chapter_${idx + 1}"/>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>pt</dc:language>
    <dc:publisher>Passages Digest</dc:publisher>
    <meta name="cover" content="cover-image"/>
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

/* Box de Destaque / Callout (Estilo Editorial Neo-Brutalist) */
.callout-box {
  margin: 2em 0;
  padding: 1.2em 1.4em;
  border-top: 2px solid #000000;
  border-left: 2px solid #000000;
  border-right: 6px solid #000000;
  border-bottom: 6px solid #000000;
  box-shadow: 4px 4px 0px #000000;
  background-color: transparent;
  page-break-inside: avoid;
  break-inside: avoid;
}

.callout-box .callout-title,
.callout-box > span:first-child,
.callout-box > strong:first-child,
.callout-box > b:first-child,
.callout-box h1,
.callout-box h2,
.callout-box h3,
.callout-box h4,
.callout-box h5,
.callout-box h6 {
  display: block;
  font-family: sans-serif;
  font-size: 1.15em;
  font-weight: bold;
  line-height: 1.3;
  margin-top: 0;
  margin-bottom: 0.6em;
  text-align: left;
  page-break-after: avoid;
  break-after: avoid;
  color: #000000;
}

.callout-box p {
  margin-top: 0;
  margin-bottom: 0.6em;
  line-height: 1.55;
  text-align: justify;
}

.callout-box p:last-child {
  margin-bottom: 0;
}

.callout-box ul,
.callout-box ol {
  margin: 0.5em 0 0.5em 1.2em;
  padding-left: 0;
}

.callout-box li {
  margin-bottom: 0.3em;
}

/* Capítulos */
.chapter-header {
  border-bottom: 2px solid #333;
  padding-bottom: 1.2em;
  margin-bottom: 2em;
}

.chapter-number {
  font-family: sans-serif;
  font-size: 0.85em;
  font-weight: bold;
  letter-spacing: 2px;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 0.5em;
}

.chapter-title {
  font-size: 1.9em;
  margin-top: 0;
  margin-bottom: 0.5em;
  line-height: 1.2;
}

.chapter-meta {
  font-size: 0.9em;
  font-style: italic;
  color: #555;
}

.chapter-footer {
  margin-top: 3em;
  font-size: 0.85em;
  color: #666;
}

/* Sumário TOC */
.toc-container {
  padding: 5% 0;
}

.toc-header {
  margin-bottom: 2em;
}

.toc-title {
  font-size: 2.2em;
  margin-bottom: 0.2em;
}

.toc-subtitle {
  font-size: 1.1em;
  font-style: italic;
  color: #555;
  margin-top: 0;
}

.toc-heading {
  font-size: 1.3em;
  margin-top: 1em;
  margin-bottom: 0.8em;
}

.toc-list {
  list-style: none;
  padding-left: 0;
}

.toc-list li {
  margin-bottom: 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px dotted #ccc;
  font-size: 1.05em;
}

.toc-num {
  font-weight: bold;
  font-family: monospace;
  margin-right: 0.5em;
  color: #555;
}

/* Artigo individual */
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
