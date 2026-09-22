// Test string matching the real Superinteressante article
console.log('--- Testando detecção de class="box" ---');
const CALLOUT_REGEX = /\b(box|callout|destaque|infobox|sidebar|wp-block-group|quadro|saiba-mais|nota|glossario|curiosidade)\b/i;
console.log('Matches "box"?:', CALLOUT_REGEX.test('box'));
console.log('Matches "wp-block-group"?:', CALLOUT_REGEX.test('wp-block-group'));
console.log('Matches "box-destaque"?:', CALLOUT_REGEX.test('box-destaque'));
console.log('Matches "aligncenter box"?:', CALLOUT_REGEX.test('aligncenter box'));
