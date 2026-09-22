import { ProcessedImage } from './types';

/**
 * Busca imagens do artigo, redimensiona se forem muito grandes,
 * converte para JPEG otimizado para Kindle e retorna para o pacote EPUB.
 */
export async function extractAndProcessImages(
  htmlContent: string,
  baseUrl: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ updatedHtml: string; images: ProcessedImage[] }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
  const imgElements = Array.from(doc.querySelectorAll('img'));

  const processedImages: ProcessedImage[] = [];
  const processedUrls = new Map<string, string>(); // url original -> internalPath

  const total = imgElements.length;
  let count = 0;

  for (let i = 0; i < total; i++) {
    const img = imgElements[i];
    const src = img.getAttribute('src');

    if (!src || src.startsWith('data:') && !src.startsWith('data:image/')) {
      img.remove();
      continue;
    }

    try {
      // Resolver URL absoluta
      const absoluteUrl = new URL(src, baseUrl).href;

      // Se já processamos esta mesma imagem antes, reutilizar
      if (processedUrls.has(absoluteUrl)) {
        img.setAttribute('src', processedUrls.get(absoluteUrl)!);
        continue;
      }

      onProgress?.(++count, total);

      // Baixar imagem (tentar fetch direto ou via background)
      const blob = await fetchImageBlob(absoluteUrl);
      if (!blob) {
        // Se falhou o download, remove a tag img para não quebrar o EPUB
        img.remove();
        continue;
      }

      // Otimizar imagem usando Canvas para garantir formato JPEG aceito pelo Kindle
      const optimized = await optimizeImageForKindle(blob);
      if (!optimized) {
        img.remove();
        continue;
      }

      const internalPath = `images/image_${processedImages.length + 1}.jpg`;
      processedUrls.set(absoluteUrl, internalPath);

      processedImages.push({
        originalUrl: absoluteUrl,
        internalPath,
        mediaType: 'image/jpeg',
        data: optimized.data
      });

      img.setAttribute('src', internalPath);
    } catch {
      // Ignorar imagens com erro de URL ou rede
      img.remove();
    }
  }

  return {
    updatedHtml: doc.body.firstElementChild?.innerHTML || doc.body.innerHTML,
    images: processedImages
  };
}

/**
 * Faz fetch da imagem tentando primeiro via fetch local e depois via background service worker.
 */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch {
    // Se bloqueado por CORS na aba do popup, solicita ao background script
    try {
      return await fetchViaBackground(url);
    } catch {
      return null;
    }
  }
}

/**
 * Envia mensagem para o background worker para fazer fetch livre de CORS
 */
function fetchViaBackground(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      return resolve(null);
    }

    chrome.runtime.sendMessage(
      { type: 'FETCH_IMAGE', url },
      (response) => {
        if (response && response.success && response.base64) {
          try {
            const byteCharacters = atob(response.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: response.contentType || 'image/jpeg' });
            resolve(blob);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Converte blob para JPEG, redimensionando se ultrapassar 1200px de largura e ignorando trackers < 30px.
 */
async function optimizeImageForKindle(blob: Blob): Promise<{ data: Uint8Array } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Descartar trackers e ícones minúsculos
      if (img.width < 30 || img.height < 30) {
        return resolve(null);
      }

      // Redimensionamento proporcional (máx 1200px de largura ou 1600px de altura)
      let { width, height } = img;
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1600;

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      // Fundo branco para imagens com transparência (PNG/WebP)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        async (jpegBlob) => {
          if (!jpegBlob) return resolve(null);
          const buffer = await jpegBlob.arrayBuffer();
          resolve({ data: new Uint8Array(buffer) });
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
