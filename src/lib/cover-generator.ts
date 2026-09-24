import { BookCoverConfig, BookPublication } from './types';

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 1800;

/**
 * Gera uma capa de livro em alta resolução (1200x1800) em formato JPEG
 * pronta para ser embutida no EPUB e reconhecida como capa pelo Kindle.
 */
export async function generateBookCover(
  publication: BookPublication,
  coverConfig: BookCoverConfig
): Promise<{ data: Uint8Array; dataUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível inicializar contexto Canvas 2D.');

  if (coverConfig.type === 'custom' && coverConfig.customImageDataUrl) {
    await drawCustomImageCover(ctx, coverConfig.customImageDataUrl, publication);
  } else {
    drawPresetCover(ctx, publication, coverConfig.presetTheme || 'passages-dark');
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('Falha ao renderizar imagem da capa.'));
        const arrayBuffer = await blob.arrayBuffer();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        resolve({
          data: new Uint8Array(arrayBuffer),
          dataUrl
        });
      },
      'image/jpeg',
      0.84
    );
  });
}

function drawPresetCover(
  ctx: CanvasRenderingContext2D,
  pub: BookPublication,
  theme: string
): void {
  const title = (pub.title || 'Sem Título').trim();
  const subtitle = (pub.subtitle || '').trim();
  const author = (pub.author || 'Edição Especial').trim();
  const dateStr = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());
  const articleCountText = `${pub.articles.length} ${pub.articles.length === 1 ? 'ARTIGO' : 'ARTIGOS'}`;

  if (theme === 'classic-light') {
    // Fundo Creme Editorial
    ctx.fillStyle = '#F8F6F0';
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

    // Moldura elegante
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, COVER_WIDTH - 120, COVER_HEIGHT - 120);

    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.strokeRect(75, 75, COVER_WIDTH - 150, COVER_HEIGHT - 150);

    // Header
    ctx.fillStyle = '#555555';
    ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('COLEÇÃO DIGITAL', COVER_WIDTH / 2, 220);

    // Título Principal
    ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 82px Georgia, "Times New Roman", serif';
    wrapText(ctx, title, COVER_WIDTH / 2, 540, COVER_WIDTH - 280, 95);

    // Linha divisória
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(COVER_WIDTH / 2 - 80, 850);
    ctx.lineTo(COVER_WIDTH / 2 + 80, 850);
    ctx.stroke();

    // Subtítulo
    if (subtitle) {
      ctx.fillStyle = '#444444';
      ctx.font = 'italic 40px Georgia, "Times New Roman", serif';
      wrapText(ctx, subtitle, COVER_WIDTH / 2, 940, COVER_WIDTH - 300, 56);
    }

    // Rodapé
    ctx.fillStyle = '#666666';
    ctx.font = '32px Georgia, serif';
    ctx.fillText(author, COVER_WIDTH / 2, COVER_HEIGHT - 240);

    ctx.font = '500 24px -apple-system, sans-serif';
    ctx.fillText(`${articleCountText.toUpperCase()} • ${dateStr.toUpperCase()}`, COVER_WIDTH / 2, COVER_HEIGHT - 180);

  } else if (theme === 'minimal-slate') {
    // Fundo Azul Slate Moderno
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

    // Detalhe superior em tom âmbar
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(100, 100, 12, 180);

    // Header
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 30px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PUBLICAÇÃO', 140, 150);

    ctx.fillStyle = '#F59E0B';
    ctx.font = '600 24px -apple-system, sans-serif';
    ctx.fillText(articleCountText, 140, 200);

    // Título Principal
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 86px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    wrapText(ctx, title, 100, 520, COVER_WIDTH - 200, 105, 'left');

    // Subtítulo
    if (subtitle) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '38px -apple-system, sans-serif';
      wrapText(ctx, subtitle, 100, 820, COVER_WIDTH - 200, 54, 'left');
    }

    // Rodapé
    ctx.fillStyle = '#64748B';
    ctx.font = '30px -apple-system, sans-serif';
    ctx.fillText(author, 100, COVER_HEIGHT - 160);
    ctx.fillText(dateStr, COVER_WIDTH - 100, COVER_HEIGHT - 160);

  } else {
    // Padrão: 'passages-dark' (Inspirado no screenshot do Passages)
    // Fundo Preto Nobre com sutil profundidade
    ctx.fillStyle = '#141413';
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

    // Moldura interna refinada
    ctx.strokeStyle = '#2B2B28';
    ctx.lineWidth = 2;
    ctx.strokeRect(90, 90, COVER_WIDTH - 180, COVER_HEIGHT - 180);

    // Marca Passages / Publicação
    ctx.fillStyle = '#9A9892';
    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '5px';
    ctx.fillText('PASSAGES', 140, 180);

    // Título Principal (Serif elegante grande como "Freud")
    ctx.fillStyle = '#F5F4EE';
    ctx.font = 'bold 96px Georgia, "Times New Roman", serif';
    wrapText(ctx, title, 140, 480, COVER_WIDTH - 280, 115, 'left');

    // Linha horizontal minimalista abaixo do título
    ctx.strokeStyle = '#8E8D88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(140, 720);
    ctx.lineTo(260, 720);
    ctx.stroke();

    // Subtítulo elegante
    if (subtitle) {
      ctx.fillStyle = '#BDBAB1';
      ctx.font = 'italic 42px Georgia, "Times New Roman", serif';
      wrapText(ctx, subtitle, 140, 820, COVER_WIDTH - 280, 60, 'left');
    }

    // Rodapé refinado
    ctx.fillStyle = '#8E8D88';
    ctx.font = '32px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(author, 140, COVER_HEIGHT - 210);

    ctx.font = '400 26px -apple-system, sans-serif';
    ctx.fillStyle = '#73716B';
    ctx.fillText(`${dateStr} • ${articleCountText}`, 140, COVER_HEIGHT - 160);
  }
}

async function drawCustomImageCover(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  pub: BookPublication
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Fundo preto base
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

      // Preenchimento proporcional cobrindo o canvas
      const scale = Math.max(COVER_WIDTH / img.width, COVER_HEIGHT / img.height);
      const x = (COVER_WIDTH - img.width * scale) / 2;
      const y = (COVER_HEIGHT - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      // Overlay sutil de gradiente escuro na base para legibilidade do título
      const gradient = ctx.createLinearGradient(0, COVER_HEIGHT * 0.4, 0, COVER_HEIGHT);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.7)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

      // Título e Subtítulo sobrepostos
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 78px Georgia, serif';
      ctx.textAlign = 'left';
      wrapText(ctx, pub.title || 'Livro', 100, COVER_HEIGHT - 380, COVER_WIDTH - 200, 90, 'left');

      if (pub.subtitle) {
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'italic 38px Georgia, serif';
        wrapText(ctx, pub.subtitle, 100, COVER_HEIGHT - 240, COVER_WIDTH - 200, 50, 'left');
      }

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '28px -apple-system, sans-serif';
      ctx.fillText(`${pub.author || ''} • ${pub.articles.length} Artigos`, 100, COVER_HEIGHT - 130);

      resolve();
    };

    img.onerror = () => {
      // Fallback para preset se falhar o carregamento da imagem customizada
      drawPresetCover(ctx, pub, 'passages-dark');
      resolve();
    };

    img.src = dataUrl;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = 'center'
): void {
  ctx.textAlign = align;
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
}
