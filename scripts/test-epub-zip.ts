import JSZip from 'jszip';

async function run() {
  const zip = new JSZip();
  // 1. mimetype STORE
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  // 2. test.html
  zip.file('OEBPS/test.html', '<p>' + 'Este é um teste de texto longo para compressão epub '.repeat(500) + '</p>');

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  console.log('Total zip buffer size:', buffer.length);
  // EPUB spec check: First 4 bytes must be PK\x03\x04
  console.log('Header magic PK34:', buffer.readUInt32LE(0).toString(16) === '4034b50');
  
  // Local file header of first entry ('mimetype'):
  // Offset 8: Compression method (2 bytes): 0 = STORE, 8 = DEFLATE
  const compMethod = buffer.readUInt16LE(8);
  console.log('Mimetype compression method (should be 0 for STORE):', compMethod);

  // Offset 26: File name length (2 bytes), Offset 28: Extra field length (2 bytes)
  const fnLen = buffer.readUInt16LE(26);
  const extraLen = buffer.readUInt16LE(28);
  const fn = buffer.subarray(30, 30 + fnLen).toString('utf8');
  console.log('First filename (should be "mimetype"):', fn);

  // Offset 30 + fnLen + extraLen: File content
  const content = buffer.subarray(30 + fnLen + extraLen, 30 + fnLen + extraLen + 20).toString('utf8');
  console.log('First file content (should start with "application/epub+zip"):', content);

  if (compMethod === 0 && fn === 'mimetype' && content.startsWith('application/epub+zip')) {
    console.log('SUCCESS: EPUB mimetype is perfectly compliant with IDPF specifications (STORE at byte 30)!');
  } else {
    console.error('FAIL: mimetype is not properly STORED!');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
