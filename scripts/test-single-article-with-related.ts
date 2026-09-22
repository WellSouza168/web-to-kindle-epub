import { JSDOM } from 'jsdom';
import { detectEditionArticles } from '../src/lib/edition-detector';
import { extractArticleFromHtml } from '../src/lib/readability';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(global as any).DOMParser = dom.window.DOMParser;
(global as any).XMLSerializer = dom.window.XMLSerializer;

console.log('--- Testando Artigo Normal de Notícias (ex: G1) com Links Relacionados ---');

const normalArticleHtml = `
<!DOCTYPE html>
<html lang="pt-br" class="ad-layout-standard">
<head>
  <meta charset="utf-8">
  <title>El Niño deve influenciar temperaturas no Brasil até meados de 2026</title>
</head>
<body class="theme-news ads-active">
  <header class="site-header">
    <nav><ul><li><a href="/">Início</a></li><li><a href="/noticias/">Notícias</a></li></ul></nav>
  </header>

  <main>
    <article>
      <header>
        <h1 class="content-head__title">El Niño deve influenciar temperaturas no Brasil até meados de 2026</h1>
        <p class="content-publication-data__from">Por Redação G1 — Brasília</p>
      </header>

      <div class="content-text">
        <p>O fenômeno climático El Niño continuará influenciando os padrões de precipitação e temperatura em grande parte da América do Sul ao longo dos próximos meses, segundo boletim divulgado nesta terça-feira pelo Centro de Previsão de Tempo e Estudos Climáticos.</p>
        <p>Especialistas apontam que a anomalia na temperatura das águas do Oceano Pacífico Equatorial mantém-se acima da média histórica, o que favorece períodos prolongados de estiagem em algumas regiões do Norte e Nordeste, ao mesmo tempo em que eleva a incidência de chuvas torrenciais na Região Sul.</p>
        <p>Além dos impactos diretos no setor agrícola, os meteorologistas alertam para possíveis oscilações nas tarifas de energia elétrica devido à variação dos reservatórios das usinas hidrelétricas.</p>
        <p>A previsão indica que a transição para uma fase de neutralidade climática deve começar a se consolidar gradativamente a partir do segundo semestre.</p>
      </div>

      <!-- Bloco de Leia Também / Veja Mais no final da matéria -->
      <section class="veja-tambem">
        <h2>Veja também</h2>
        <div class="card">
          <a href="https://g1.globo.com/natureza/chuvas-sul-alertas/">Defesa Civil emite novos alertas para temporais no Sul</a>
        </div>
        <div class="card">
          <a href="https://g1.globo.com/economia/agronegocio-safra-previsao/">Safra de grãos deve bater novo recorde apesar do clima</a>
        </div>
        <div class="card">
          <a href="https://g1.globo.com/ciencia/temperatura-global-oceano/">Temperatura média dos oceanos atinge novo pico histórico</a>
        </div>
      </section>

      <!-- Feeds secundários -->
      <aside class="feed-post">
        <a href="https://g1.globo.com/politica/votacao-senado-clima/">Senado aprova fundo de combate a desastres climáticos</a>
      </aside>
    </article>
  </main>

  <footer>
    <p>© Globo Comunicação e Participações S.A.</p>
  </footer>
</body>
</html>
`;

const articleUrl = 'https://g1.globo.com/natureza/noticia/2026/08/el-nino-influenciara-temperaturas.ghtml';
const articleDoc = new JSDOM(normalArticleHtml, { url: articleUrl }).window.document;

// 1. O detector de edição NÃO deve classificar este artigo como uma edição de revista
const detectedEdition = detectEditionArticles(articleDoc, articleUrl);

if (detectedEdition !== null) {
  console.error('❌ FALHA: Artigo comum do G1 foi erroneamente detectado como Edição de Revista!');
  console.error('Edição detectada:', detectedEdition);
  process.exit(1);
}
console.log('✅ Detector de edição ignorou corretamente o artigo normal com "Veja também".');

// 2. O Readability deve extrair com sucesso o artigo individual
const parsedArticle = extractArticleFromHtml(normalArticleHtml, articleUrl);
if (!parsedArticle) {
  console.error('❌ FALHA: Readability falhou ao extrair o artigo normal!');
  process.exit(1);
}

console.log('✅ Readability extraiu o artigo individual com sucesso:');
console.log('📌 Título:', parsedArticle.title);
console.log('📌 Autor:', parsedArticle.byline);
console.log('📌 Palavras:', parsedArticle.wordCount);

if (!parsedArticle.contentHtml.includes('fenômeno climático El Niño')) {
  console.error('❌ FALHA: Conteúdo do artigo foi corrompido!');
  process.exit(1);
}

console.log('\n🎉 TESTE DE ARTIGO COMUM COM "VEJA TAMBÉM" PASSOU COM 100% DE SUCESSO!');
