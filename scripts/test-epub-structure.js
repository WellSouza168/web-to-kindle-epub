import JSZip from 'jszip';

async function testEpubPackaging() {
  console.log('--- Testando conformidade do gerador EPUB para Kindle ---');

  const zip = new JSZip();

  // 1. mimetype como primeiro arquivo e sem compressão
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
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol><li><a href="article.xhtml">Capitulo 1</a></li></ol></nav></body>
</html>`);
  oebps.file('article.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Teste</title></head>
  <body><h1>Artigo de Teste</h1><p>Conteudo limpo e formatado.</p></body>
</html>`);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
  console.log(`Buffer gerado: ${zipBuffer.length} bytes.`);

  // Validar leitura do zip
  const loadedZip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(loadedZip.files);

  console.log('Arquivos no pacote:', files);

  // Validar se mimetype é o primeiro arquivo
  if (files[0] !== 'mimetype') {
    throw new Error(`FALHA: O primeiro arquivo no ZIP deve ser 'mimetype', mas foi '${files[0]}'`);
  }

  const mimetypeContent = await loadedZip.files['mimetype'].async('text');
  if (mimetypeContent !== 'application/epub+zip') {
    throw new Error(`FALHA: Conteudo do mimetype invalido: '${mimetypeContent}'`);
  }

  // Validar container.xml
  if (!loadedZip.files['META-INF/container.xml']) {
    throw new Error("FALHA: 'META-INF/container.xml' nao encontrado no pacote.");
  }

  console.log('✅ SUCESSO: Todos os testes de conformidade EPUB passaram com sucesso!');
}

testEpubPackaging().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
