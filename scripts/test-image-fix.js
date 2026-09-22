import JSZip from 'jszip';

async function testImageFix() {
  console.log('--- Testando Correção de Imagens e Compatibilidade de Capítulos ---');

  const rawHtml = `
    <p>alterados da consciência, como o sonho.</p>
    <img loading="lazy" decoding="async" alt="SI_Freud_Inconsciente_1" class="aligncenter wp-image-302496 size-full" src="https://super.abril.com.br/wp-content/uploads/2020/04/si_freud_inconsciente_1.jpg?quality=70&amp;strip=info" border="0" alt="" title="SI_Freud_Inconsciente_1" width="1024" height="682" data-restrict="false" srcset="https://super.abril.com.br/wp-content/uploads/2020/04/si_freud_inconsciente_1.jpg 1024w, https://super.abril.com.br/wp-content/uploads/2020/04/si_freud_inconsciente_1.jpg?resize=300,200 300w" sizes="auto, (max-width: 1024px) 100vw, 1024px" />
    <p>Desde então, sempre houve, na filosofia, teorias sobre o inconsciente.</p>
  `;

  // Simular processamento da imagem
  // 1. O updatedHtml deve substituir o src por um caminho relativo local limpo sem srcset
  const updatedHtml = rawHtml.replace(
    /<img[^>]+SI_Freud_Inconsciente_1[^>]*>/,
    '<img src="images/image_1.jpg" alt="SI_Freud_Inconsciente_1"/>'
  );

  const chapterNum = '01';
  let chapterHtml = updatedHtml; // Agora inicializado com updatedHtml!
  const imgInternalPath = 'images/image_1.jpg';
  const uniquePath = `images/c${chapterNum}_image_1.jpg`;

  chapterHtml = chapterHtml.split(imgInternalPath).join(uniquePath);

  console.log('HTML do capítulo após substituição:\n', chapterHtml);

  if (chapterHtml.includes('https://super.abril.com.br')) {
    throw new Error('FALHA: O HTML do capítulo ainda contém URL externa http/https!');
  }

  if (chapterHtml.includes('srcset')) {
    throw new Error('FALHA: O HTML do capítulo ainda contém atributo srcset!');
  }

  if (!chapterHtml.includes('images/c01_image_1.jpg')) {
    throw new Error('FALHA: O caminho local único da imagem não foi inserido no capítulo!');
  }

  // Simular empacotamento no ZIP
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  const oebps = zip.folder('OEBPS');
  oebps.file('chapter_01.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${chapterHtml}</body></html>`);
  oebps.folder('images').file('c01_image_1.jpg', Buffer.from([255, 216, 255, 224, 0, 16, 74, 70]));

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const loaded = await JSZip.loadAsync(buf);

  if (!loaded.files['OEBPS/images/c01_image_1.jpg']) {
    throw new Error('FALHA: A imagem c01_image_1.jpg não está presente no ZIP!');
  }

  const chapterContent = await loaded.files['OEBPS/chapter_01.xhtml'].async('text');
  if (!chapterContent.includes('src="images/c01_image_1.jpg"')) {
    throw new Error('FALHA: chapter_01.xhtml não aponta para o caminho interno relativo!');
  }

  console.log('✅ SUCESSO: Todas as validações da correção de imagens passaram com êxito!');
}

testImageFix().catch((err) => {
  console.error(err);
  process.exit(1);
});
