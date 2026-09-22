import { JSDOM } from 'jsdom';
import { isAdDisclaimerText, sanitizeToXhtml } from '../src/lib/xhtml-sanitizer';
import { extractArticleFromHtml } from '../src/lib/readability';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(global as any).DOMParser = dom.window.DOMParser;
(global as any).XMLSerializer = dom.window.XMLSerializer;

console.log('--- Testando Filtro de Avisos de Publicidade ---');

// 1. Teste Unitário de detecção de strings
const testCasesPositive = [
  'Continua após a publicidade',
  'Continua após a publicidade.',
  'continua após a publicidade',
  '— Continua após a publicidade —',
  '- Continua após a publicidade -',
  '[Continua após a publicidade]',
  'Continua depois da publicidade',
  'Continua após o anúncio',
  'Publicidade',
  'publicidade',
  'Anúncio',
  'anúncio',
  'Propaganda'
];

for (const phrase of testCasesPositive) {
  if (!isAdDisclaimerText(phrase)) {
    console.error(`❌ FALHA: Deveria detectar como publicidade: "${phrase}"`);
    process.exit(1);
  }
}
console.log(`✅ Todos os ${testCasesPositive.length} disclaimers publicitários foram detectados corretamente.`);

// Textos legítimos que NÃO podem ser descartados
const testCasesNegative = [
  'Mesmo com esforços para melhorar as metodologias, a taxa de falha saltou para 96%.',
  '“É possível que a pesquisa com animais seja, no geral, mais custosa e prejudicial do que benéfica para a saúde humana”, escreveu a neurologista Aysha Akhtar.',
  'A publicidade infantil é um tema debatido em vários países.',
  'O anúncio da nova descoberta científica surpreendeu os astrônomos.'
];

for (const phrase of testCasesNegative) {
  if (isAdDisclaimerText(phrase)) {
    console.error(`❌ FALHA: Texto jornalístico legítimo foi erroneamente marcado como anúncio: "${phrase}"`);
    process.exit(1);
  }
}
console.log(`✅ Textos legítimos do artigo foram preservados com 100% de segurança.`);

// 2. Teste do Sanitizador XHTML
const sampleArticleHtml = `
  <p>Mesmo com esforços para melhorar as metodologias, a taxa de falha saltou para 96%.</p>
  <div class="ads-container">
    <p>Continua após a publicidade</p>
  </div>
  <p>— Continua após a publicidade —</p>
  <p>“É possível que a pesquisa com animais seja, no geral, mais custosa e prejudicial do que benéfica para a saúde humana”, escreveu a neurologista Aysha Akhtar.</p>
`;

const sanitized = sanitizeToXhtml(sampleArticleHtml);
console.log('\n--- Resultado do Sanitizador XHTML: ---');
console.log(sanitized);

if (sanitized.toLowerCase().includes('continua após a publicidade')) {
  console.error('❌ FALHA: O texto "Continua após a publicidade" ainda está presente no XHTML sanitizado!');
  process.exit(1);
}

if (!sanitized.includes('taxa de falha saltou para 96%') || !sanitized.includes('Aysha Akhtar')) {
  console.error('❌ FALHA: Os parágrafos legítimos da matéria foram corrompidos!');
  process.exit(1);
}

console.log('✅ Sanitizador removeu completamente os disclaimers sem afetar o conteúdo.');

// 3. Teste do Readability
const fullHtml = `
  <!DOCTYPE html>
  <html>
    <head><title>Artigo de Teste</title></head>
    <body>
      <main>
        <h1>Como a Ciência Evoluiu</h1>
        <p>Introdução sobre os métodos científicos e sua aplicação prática na sociedade moderna ao longo dos séculos.</p>
        <div class="ads-wrapper">
          <p>Continua após a publicidade</p>
        </div>
        <p>A fase experimental requer rigor estatístico para evitar falsos positivos e conclusões precipitadas em laboratório.</p>
      </main>
    </body>
  </html>
`;

const parsed = extractArticleFromHtml(fullHtml, 'https://super.abril.com.br/teste');
if (!parsed) {
  console.error('❌ FALHA ao extrair artigo com Readability!');
  process.exit(1);
}

if (parsed.contentHtml.toLowerCase().includes('continua após a publicidade')) {
  console.error('❌ FALHA: Readability manteve "Continua após a publicidade" no contentHtml!');
  process.exit(1);
}

console.log('✅ Readability filtrou com sucesso os blocos publicitários.');
console.log('\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
