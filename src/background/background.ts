/**
 * Background Service Worker (Manifest V3)
 * Responsável por downloads e requisições de imagens sem restrições de CORS.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Web to Kindle EPUB extension installed.');
});

// Listener de mensagens do popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_IMAGE') {
    handleFetchImage(message.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Mantém a conexão aberta para resposta assíncrona
  }

  if (message.type === 'DOWNLOAD_FILE') {
    handleDownloadFile(message.url, message.filename)
      .then((downloadId) => sendResponse({ success: true, downloadId }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleFetchImage(url: string) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();

  // Converter ArrayBuffer para base64
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    success: true,
    contentType,
    base64
  };
}

async function handleDownloadFile(url: string, filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}
