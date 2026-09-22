import fs from 'fs';

function testCalloutSupport() {
  console.log('--- Validando Suporte a Boxes de Destaque / Callouts ---');

  // 1. Validar CSS em epub-generator.ts
  const epubCode = fs.readFileSync('src/lib/epub-generator.ts', 'utf-8');
  if (!epubCode.includes('.callout-box')) {
    throw new Error('FALHA: .callout-box ausente em epub-generator.ts');
  }
  if (!epubCode.includes('box-shadow: 4px 4px 0px #000000')) {
    throw new Error('FALHA: box-shadow ausente em epub-generator.ts');
  }
  if (!epubCode.includes('page-break-inside: avoid')) {
    throw new Error('FALHA: page-break-inside ausente em epub-generator.ts');
  }

  // 2. Validar que aside NÃO está no FORBIDDEN_TAGS de xhtml-sanitizer.ts
  const sanitizerCode = fs.readFileSync('src/lib/xhtml-sanitizer.ts', 'utf-8');
  const forbiddenMatch = sanitizerCode.match(/FORBIDDEN_TAGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!forbiddenMatch) {
    throw new Error('FALHA: FORBIDDEN_TAGS não encontrado');
  }
  if (forbiddenMatch[1].includes("'aside'")) {
    throw new Error('FALHA: aside ainda está dentro de FORBIDDEN_TAGS');
  }
  if (!sanitizerCode.includes("div.className = 'callout-box'")) {
    throw new Error('FALHA: Conversão de aside para callout-box não encontrada');
  }

  // 3. Validar marcação de callouts em readability.ts
  const readabilityCode = fs.readFileSync('src/lib/readability.ts', 'utf-8');
  if (!readabilityCode.includes("data-callout', 'true'")) {
    throw new Error('FALHA: Marcação de data-callout não encontrada em readability.ts');
  }
  if (!readabilityCode.includes('keepClasses: true')) {
    throw new Error('FALHA: keepClasses: true não está configurado em readability.ts');
  }

  console.log('✅ SUCESSO: Todos os arquivos contêm o suporte e regras completas para Boxes de Destaque!');
}

testCalloutSupport();
