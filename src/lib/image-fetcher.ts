import { ProcessedImage } from './types';

/**
 * Busca imagens do artigo, resolve lazy-loading, remove srcset conflitante,
 * converte para formato aceito pelo Kindle e atualiza os caminhos no HTML.
 */
export async function extractAndProcessImages(
  htmlContent: string,
  baseUrl: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ updatedHtml: string; images: ProcessedImage[] }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
  const container = doc.body.firstElementChild || doc.body;
  const imgElements = Array.from(container.querySelectorAll('img'));

  const processedImages: ProcessedImage[] = [];
  const processedUrls = new Map<string, string>(); // url original -> internalPath

  const total = imgElements.length;
  let count = 0;

  for (let i = 0; i < total; i++) {
    const img = imgElements[i];

    // 1. Extrair a melhor URL da imagem (suporte a lazy-loading, data-src e srcset)
    const targetUrl = resolveBestImageUrl(img, baseUrl);

    if (!targetUrl) {
      img.remove();
      continue;
    }

    // Se já processamos esta mesma URL antes, reutilizar o caminho interno
    if (processedUrls.has(targetUrl)) {
      cleanAndSetImgAttributes(img, processedUrls.get(targetUrl)!);
      continue;
    }

    onProgress?.(++count, total);

    try {
      // 2. Baixar os bytes da imagem
      const fetched = await fetchImageBytes(targetUrl);
      if (!fetched || fetched.data.length === 0) {
        // Se falhou o download, remove a tag img para evitar ícone quebrado no Kindle
        img.remove();
        continue;
      }

      // 3. Processar / Validar imagem para o Kindle
      const finalImage = await processImageForKindle(fetched.data, fetched.mediaType);
      if (!finalImage) {
        img.remove();
        continue;
      }

      const internalPath = `images/image_${processedImages.length + 1}.jpg`;
      processedUrls.set(targetUrl, internalPath);

      processedImages.push({
        originalUrl: targetUrl,
        internalPath,
        mediaType: finalImage.mediaType,
        data: finalImage.data
      });

      // 4. Atualizar o elemento <img> e limpar atributos conflitantes (srcset, data-src, etc.)
      cleanAndSetImgAttributes(img, internalPath);
    } catch {
      // Em caso de erro, remover a tag img para garantir que o Kindle não exiba ícone quebrado
      img.remove();
    }
  }

  return {
    updatedHtml: container.innerHTML,
    images: processedImages
  };
}

/**
 * Identifica a URL real da imagem, contornando técnicas de lazy loading e data-src.
 */
function resolveBestImageUrl(img: Element, baseUrl: string): string | null {
  // Verificar atributos comuns de lazy loading primeiro
  let candidate =
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-lazy-src') ||
    img.getAttribute('data-actualsrc') ||
    img.getAttribute('src');

  // Se o candidato for vazio ou for um placeholder data: (ex: svg/gif de 1px)
  if (!candidate || candidate.startsWith('data:')) {
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (srcset) {
      const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        // Pega a URL do item de maior resolução (último do srcset)
        const lastPart = parts[parts.length - 1].split(/\s+/)[0];
        if (lastPart && !lastPart.startsWith('data:')) {
          candidate = lastPart;
        }
      }
    }
  }

  if (!candidate) return null;

  // Ignorar data URIs inválidos ou SVGs embutidos como tracker
  if (candidate.startsWith('data:')) {
    if (candidate.startsWith('data:image/jpeg') || candidate.startsWith('data:image/png')) {
      return candidate;
    }
    return null;
  }

  // Suporte a URLs relativas com protocolo duplo (//exemplo.com/foto.jpg)
  if (candidate.startsWith('//')) {
    candidate = 'https:' + candidate;
  }

  try {
    return new URL(candidate, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Remove srcset, sizes, data-* e define o src local limpo no elemento <img>.
 */
function cleanAndSetImgAttributes(img: Element, localSrc: string): void {
  img.setAttribute('src', localSrc);

  // CRUCIAL: Remover srcset e data attributes para que o leitor EPUB não tente carregar links externos
  img.removeAttribute('srcset');
  img.removeAttribute('data-src');
  img.removeAttribute('data-srcset');
  img.removeAttribute('data-original');
  img.removeAttribute('data-lazy-src');
  img.removeAttribute('data-actualsrc');
  img.removeAttribute('sizes');
  img.removeAttribute('loading');
  img.removeAttribute('decoding');
  img.removeAttribute('width');
  img.removeAttribute('height');
}

/**
 * Baixa os bytes da imagem utilizando o background worker (livre de CORS) ou fetch direto.
 */
async function fetchImageBytes(url: string): Promise<{ data: Uint8Array; mediaType: string } | null> {
  // Se for data URL base64
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mediaType = match[1];
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return { data: bytes, mediaType };
    }
    return null;
  }

  // 1. Tentar primeiro via background service worker (que possui permissão total <all_urls>)
  try {
    const bgResponse = await fetchViaBackground(url);
    if (bgResponse) {
      return bgResponse;
    }
  } catch {}

  // 2. Fallback para fetch direto
  try {
    const response = await fetch(url);
    if (response.ok) {
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();
      return {
        data: new Uint8Array(buffer),
        mediaType: contentType.split(';')[0].trim()
      };
    }
  } catch {}

  return null;
}

function fetchViaBackground(url: string): Promise<{ data: Uint8Array; mediaType: string } | null> {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      return resolve(null);
    }

    chrome.runtime.sendMessage(
      { type: 'FETCH_IMAGE', url },
      (response) => {
        if (response && response.success && response.base64) {
          try {
            const binary = atob(response.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            resolve({
              data: bytes,
              mediaType: response.contentType || 'image/jpeg'
            });
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
 * Processa a imagem para compatibilidade ideal com o Kindle.
 * Se já for JPEG ou PNG de tamanho adequado, preserva os bytes originais diretamente.
 */
async function processImageForKindle(
  data: Uint8Array,
  mediaType: string
): Promise<{ data: Uint8Array; mediaType: string } | null> {
  // Se for JPEG ou PNG com tamanho razoável (< 1.5MB), aceita diretamente sem reprocessar
  const isJpegOrPng =
    mediaType.includes('jpeg') ||
    mediaType.includes('jpg') ||
    mediaType.includes('png');

  if (isJpegOrPng && data.length < 1500000) {
    return { data, mediaType: mediaType.includes('png') ? 'image/png' : 'image/jpeg' };
  }

  // Para imagens WebP, AVIF ou muito grandes, redimensiona via Canvas
  return new Promise((resolve) => {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: mediaType });
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Descartar ícones minúsculos e pixels de rastreamento
      if (img.width < 30 || img.height < 30) {
        return resolve(null);
      }

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
      if (!ctx) {
        return resolve({ data, mediaType: 'image/jpeg' });
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        async (jpegBlob) => {
          if (!jpegBlob) {
            return resolve({ data, mediaType: 'image/jpeg' });
          }
          const buf = await jpegBlob.arrayBuffer();
          resolve({
            data: new Uint8Array(buf),
            mediaType: 'image/jpeg'
          });
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Se falhar o canvas mas já temos dados JPEG/PNG, mantém a imagem original
      if (isJpegOrPng) {
        resolve({ data, mediaType: 'image/jpeg' });
      } else {
        resolve(null);
      }
    };

    img.src = url;
  });
}
