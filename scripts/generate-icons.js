import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, r, g, b) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  // Generate image data with a book / kindle stylized pattern
  // RGBA pixels with a line filter byte (0) per row
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      // Determine if pixel is inside rounded rect
      const radius = Math.floor(width * 0.18);
      const isInside = (x >= 1 && x < width - 1 && y >= 1 && y < height - 1);
      
      // Draw a book shape: Kindle dark gray background with orange spine/bookmark
      const isBookmark = (x >= Math.floor(width * 0.6) && x <= Math.floor(width * 0.75) && y < Math.floor(height * 0.5));
      const isLine = (y >= Math.floor(height * 0.6) && y <= Math.floor(height * 0.65) && x >= Math.floor(width * 0.25) && x <= Math.floor(width * 0.75))
                  || (y >= Math.floor(height * 0.72) && y <= Math.floor(height * 0.77) && x >= Math.floor(width * 0.25) && x <= Math.floor(width * 0.6));

      if (isInside) {
        if (isBookmark) {
          // Kindle Orange #FF9900
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 153;
          rawData[pxOffset + 2] = 0;
          rawData[pxOffset + 3] = 255;
        } else if (isLine) {
          // White text line
          rawData[pxOffset] = 240;
          rawData[pxOffset + 1] = 240;
          rawData[pxOffset + 2] = 240;
          rawData[pxOffset + 3] = 255;
        } else {
          // Kindle dark slate #1E293B
          rawData[pxOffset] = r;
          rawData[pxOffset + 1] = g;
          rawData[pxOffset + 2] = b;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Transparent outside
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 implementation
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }

  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const iconsDir = path.resolve('public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate 16, 48, 128
for (const size of [16, 48, 128]) {
  const png = createPNG(size, size, 30, 41, 59); // Slate-800
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png (${size}x${size})`);
}
