import JSZip from 'jszip';

async function testMultiChapterEpubPackaging() {
  console.log('--- Testando Gerador de Livro Multi-Capítulos com Capa no Padrão Kindle ---');

  const zip = new JSZip();

  // 1. mimetype STORE
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. container.xml
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');
  oebps.file('style.css', 'body { margin: 5%; }');

  // Capa
  const images = oebps.folder('images');
  images.file('cover.jpg', Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])); // Dummy JPEG header
  oebps.file('cover.xhtml', '<html><body><img src="images/cover.jpg"/></body></html>');

  // Capítulos
  const articles = [
    { title: 'Inconsciente - O iceberg sob a água', num: '01' },
    { title: 'Psicanálise - Somos todos neuróticos', num: '02' },
    { title: 'Sonho - Uma máquina de disfarçar desejos', num: '03' }
  ];

  for (const art of articles) {
    oebps.file(`chapter_${art.num}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${art.num}. ${art.title}</title></head>
  <body><h1>Capítulo ${art.num}: ${art.title}</h1><p>Texto do capítulo.</p></body>
</html>`);
  }

  // Nav e TOC
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        ${articles.map(a => `<li><a href="chapter_${a.num}.xhtml">${a.num}. ${a.title}</a></li>`).join('\n')}
      </ol>
    </nav>
  </body>
</html>`);

  oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:test"/></head>
  <docTitle><text>Freud - Para entender de uma vez</text></docTitle>
  <navMap>
    ${articles.map((a, i) => `
    <navPoint id="nav-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${a.num}. ${a.title}</text></navLabel>
      <content src="chapter_${a.num}.xhtml"/>
    </navPoint>`).join('')}
  </navMap>
</ncx>`);

  // content.opf
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:test</dc:identifier>
    <dc:title>Freud</dc:title>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    ${articles.map(a => `<item id="ch_${a.num}" href="chapter_${a.num}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover"/>
    <itemref idref="nav"/>
    ${articles.map(a => `<itemref idref="ch_${a.num}"/>`).join('\n')}
  </spine>
</package>`);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
  console.log(`Pacote ZIP gerado: ${buffer.length} bytes`);

  const loaded = await JSZip.loadAsync(buffer);
  const keys = Object.keys(loaded.files);

  // 1. mimetype primeiro
  if (keys[0] !== 'mimetype') {
    throw new Error(`Primeiro arquivo não é mimetype: ${keys[0]}`);
  }

  // 2. Capa cover.jpg
  if (!loaded.files['OEBPS/images/cover.jpg']) {
    throw new Error('OEBPS/images/cover.jpg ausente!');
  }

  // 3. Capítulos
  for (const art of articles) {
    if (!loaded.files[`OEBPS/chapter_${art.num}.xhtml`]) {
      throw new Error(`OEBPS/chapter_${art.num}.xhtml ausente!`);
    }
  }

  const opf = await loaded.files['OEBPS/content.opf'].async('text');
  if (!opf.includes('properties="cover-image"')) {
    throw new Error('Propriedade cover-image ausente no content.opf');
  }

  console.log('Arquivos verificados com sucesso:', keys);
  console.log('✅ TESTE MULTI-CAPÍTULOS CONCLUÍDO COM 100% DE SUCESSO!');
}

testMultiChapterEpubPackaging().catch((err) => {
  console.error(err);
  process.exit(1);
});
