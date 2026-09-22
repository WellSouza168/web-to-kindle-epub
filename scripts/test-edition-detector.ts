import fs from 'fs';
import { JSDOM } from 'jsdom';
import { detectEditionArticles } from '../src/lib/edition-detector';

// Carregar o arquivo com o HTML real salvo da Superinteressante Edição 490
const contentMdPath = 'C:\\Users\\Well_\\.gemini\\antigravity\\brain\\525fd7c6-ae98-4246-abdc-f088fb1a06e5\\.system_generated\\steps\\394\\content.md';
const contentRaw = fs.readFileSync(contentMdPath, 'utf-8');

// O HTML começa após a linha '---'
const parts = contentRaw.split('---');
const html = parts.slice(1).join('---').trim();

console.log('--- Testando Detecção da Edição 490 da Superinteressante ---');
console.log('Tamanho do HTML:', html.length, 'bytes');

const dom = new JSDOM(html, { url: 'https://super.abril.com.br/edicao/490/' });
const doc = dom.window.document;

console.log('Title:', doc.title);
console.log('Number of .card:', doc.querySelectorAll('.card').length);
console.log('Number of .edition-content:', doc.querySelectorAll('.edition-content').length);
console.log('Number of .cards:', doc.querySelectorAll('.cards').length);
console.log('Number of a tags:', doc.querySelectorAll('a').length);

const edition = detectEditionArticles(doc, 'https://super.abril.com.br/edicao/490/');

if (!edition) {
  console.error('❌ FALHA: Nenhuma edição detectada!');
  process.exit(1);
}

console.log('✅ Edição detectada com sucesso!');
console.log('📌 Título da Edição:', edition.title);
console.log('📌 Subtítulo:', edition.subtitle);
console.log('📌 Veículo:', edition.siteName);
console.log('📌 URL da Capa Oficial:', edition.coverImageUrl);
console.log('📌 Total de Matérias Detectadas:', edition.articles.length);

console.log('\n--- Lista de Matérias Extraídas: ---');
edition.articles.forEach((art, idx) => {
  console.log(`${idx + 1}. [${art.section || 'Geral'}] ${art.title}`);
  console.log(`   URL: ${art.url}`);
  if (art.byline) console.log(`   Autor: ${art.byline}`);
});

// Verificações de integridade
if (edition.articles.length < 10) {
  console.error('❌ FALHA: Menos de 10 matérias foram encontradas na Edição 490!');
  process.exit(1);
}

// Verificar se não vazou nenhum link de assine ou menu
for (const art of edition.articles) {
  if (art.url.includes('assine') || art.url.includes('ofertas') || art.url.includes('login')) {
    console.error('❌ FALHA: Link não editorial vazou para as matérias:', art.url);
    process.exit(1);
  }
}

console.log('\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
