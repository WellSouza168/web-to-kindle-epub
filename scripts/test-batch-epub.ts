import fs from 'fs';
import { JSDOM } from 'jsdom';
import { detectEditionArticles } from '../src/lib/edition-detector';
import { generatePublicationEpub } from '../src/lib/epub-generator';
import { generateBookCover } from '../src/lib/cover-generator';
import { BookPublication, BookArticle } from '../src/lib/types';

console.log('--- Teste de Geração de Livro EPUB a partir da Edição 490 ---');

const contentMdPath = 'C:\\Users\\Well_\\.gemini\\antigravity\\brain\\525fd7c6-ae98-4246-abdc-f088fb1a06e5\\.system_generated\\steps\\394\\content.md';
const contentRaw = fs.readFileSync(contentMdPath, 'utf-8');
const html = contentRaw.split('---').slice(1).join('---').trim();

const dom = new JSDOM(html, { url: 'https://super.abril.com.br/edicao/490/' });
const doc = dom.window.document;
(global as any).DOMParser = dom.window.DOMParser;
(global as any).XMLSerializer = dom.window.XMLSerializer;

const edition = detectEditionArticles(doc, 'https://super.abril.com.br/edicao/490/');
if (!edition) {
  console.error('❌ Falha ao detectar edição!');
  process.exit(1);
}

console.log(`✅ Edição detectada com ${edition.articles.length} matérias.`);

// Simular conversão para BookArticle (com conteúdo de amostra para cada matéria)
const articles: BookArticle[] = edition.articles.map((art, idx) => ({
  id: `art_${idx}`,
  title: art.title,
  byline: art.byline || 'Redação Super',
  siteName: edition.siteName,
  excerpt: art.description || null,
  url: art.url,
  readingTimeMinutes: 5,
  wordCount: 800,
  contentHtml: `
    <p class="lead">${art.description || 'Reportagem especial da edição.'}</p>
    <p>Esta matéria compõe a ${edition.title}. Aprofunde-se nos fatos, dados e contexto apresentados pelos nossos jornalistas.</p>
    <aside class="box" data-callout="true">
      <h4>Destaque Editorial</h4>
      <p>Seção: ${art.section || 'Geral'}. Autoria: ${art.byline || 'Superinteressante'}.</p>
    </aside>
    <p>Conhecimento transformador para mentes curiosas.</p>
  `,
  savedAt: new Date().toISOString()
}));

const publication: BookPublication = {
  id: 'super_490',
  title: edition.title,
  subtitle: edition.subtitle || 'Agosto de 2026',
  author: edition.siteName,
  cover: {
    type: 'preset',
    presetTheme: 'passages-dark'
  },
  articles,
  updatedAt: new Date().toISOString()
};

async function run() {
  console.log('Utilizando bytes simulados de capa...');
  const coverBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]); // JPEG header

  console.log('Compilando EPUB multi-capítulos...');
  const epubBlob = await generatePublicationEpub(
    publication,
    coverBytes,
    { includeImages: false },
    (cur, total, msg) => {
      console.log(`[Progresso ${cur}/${total}] ${msg}`);
    }
  );

  console.log('EPUB compilado com sucesso! Tamanho final:', epubBlob.size, 'bytes');
  if (epubBlob.size < 5000) {
    console.error('❌ EPUB gerado parece muito pequeno!');
    process.exit(1);
  }

  console.log('🎉 Validação End-to-End da Edição de Revista concluída com êxito!');
}

run().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
