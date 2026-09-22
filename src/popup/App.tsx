import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  Clock,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Bookmark
} from 'lucide-react';
import { ArticleMetadata, ExtractionStatus } from '../lib/types';
import { extractArticleFromHtml } from '../lib/readability';
import { extractAndProcessImages } from '../lib/image-fetcher';
import { generateKindleEpub } from '../lib/epub-generator';

export const App: React.FC = () => {
  const [article, setArticle] = useState<ArticleMetadata | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>({ state: 'extracting', progressMessage: 'Analisando artigo na página...' });
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [includeImages, setIncludeImages] = useState(true);
  const [addCoverPage, setAddCoverPage] = useState(true);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Extrair artigo da aba ativa ao abrir
  useEffect(() => {
    extractContentFromActiveTab();
  }, []);

  const extractContentFromActiveTab = async () => {
    setStatus({ state: 'extracting', progressMessage: 'Lendo conteúdo da página atual...' });
    setDownloadSuccess(false);

    try {
      if (!chrome?.tabs?.query) {
        // Modo de demonstração fora do navegador de extensão
        loadDemoArticle();
        return;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !activeTab.id || !activeTab.url) {
        throw new Error('Não foi possível identificar a aba ativa.');
      }

      if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('about:')) {
        throw new Error('Páginas de sistema do navegador não podem ser convertidas em artigos.');
      }

      // Injeta uma pequena função para obter o HTML e metadados da página
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => ({
          html: document.documentElement.outerHTML,
          url: window.location.href,
          title: document.title
        })
      });

      const pageData = results[0]?.result;
      if (!pageData || !pageData.html) {
        throw new Error('Falha ao capturar o código HTML da página.');
      }

      const parsed = extractArticleFromHtml(pageData.html, pageData.url);
      if (!parsed) {
        throw new Error('Não foi detectado um artigo principal legível nesta página. Tente em páginas com artigos de texto ou notícias.');
      }

      setArticle(parsed);
      setTitle(parsed.title);
      setAuthor(parsed.byline || parsed.siteName || '');
      setStatus({ state: 'ready' });
    } catch (err: any) {
      setStatus({
        state: 'error',
        errorMessage: err.message || 'Erro inesperado ao extrair conteúdo.'
      });
    }
  };

  const loadDemoArticle = () => {
    const demoArticle: ArticleMetadata = {
      title: 'A Revolução da Leitura Digital e a Tela E-Ink',
      byline: 'Equipe de Tecnologia',
      siteName: 'TecnoBlog Exemplo',
      excerpt: 'Como a tecnologia de tinta eletrônica transformou a experiência de leitura em dispositivos portáteis.',
      url: 'https://exemplo.com.br/artigo-eink',
      readingTimeMinutes: 5,
      wordCount: 1150,
      contentHtml: `
        <p>A tecnologia e-ink (tinta eletrônica) revolucionou a forma como consumimos textos longos.</p>
        <h2>Vantagens do E-Ink</h2>
        <p>Ao contrário das telas LCD e OLED convencionais, o e-ink reflete a luz ambiente em vez de emitir luz diretamente nos olhos do leitor, eliminando o cansaço visual após horas contínuas de leitura.</p>
        <blockquote>"Ler em um dispositivo e-ink é a experiência que mais se aproxima do papel físico."</blockquote>
        <p>Com a conversão direta de artigos da web para o formato EPUB, você pode acumular os melhores ensaios e reportagens para desfrutar com foco e sem distrações.</p>
      `,
      textContent: 'A tecnologia e-ink revolucionou...'
    };
    setArticle(demoArticle);
    setTitle(demoArticle.title);
    setAuthor(demoArticle.byline || '');
    setStatus({ state: 'ready' });
  };

  const handleGenerateEpub = async () => {
    if (!article) return;

    setStatus({ state: 'generating', progressMessage: 'Processando artigo...' });
    setProgress(null);
    setDownloadSuccess(false);

    try {
      let finalImages: any[] = [];
      let finalHtml = article.contentHtml;

      // 1. Processar imagens se habilitado
      if (includeImages) {
        setStatus({ state: 'generating', progressMessage: 'Baixando e otimizando imagens...' });
        const imgResult = await extractAndProcessImages(
          article.contentHtml,
          article.url,
          (current, total) => {
            setProgress({ current, total });
          }
        );
        finalImages = imgResult.images;
        finalHtml = imgResult.updatedHtml;
      }

      // 2. Gerar EPUB
      setStatus({ state: 'generating', progressMessage: 'Empacotando arquivo EPUB para Kindle...' });
      const epubBlob = await generateKindleEpub(
        { ...article, contentHtml: finalHtml },
        {
          title: title.trim() || article.title,
          author: author.trim() || 'Autor Desconhecido',
          includeImages,
          addCoverPage,
          language: 'pt'
        },
        finalImages
      );

      // 3. Fazer download do arquivo
      const safeTitle = (title.trim() || 'artigo')
        .replace(/[\\/:*?"<>|]/g, '')
        .substring(0, 60)
        .trim();
      const filename = `${safeTitle}.epub`;

      const downloadUrl = URL.createObjectURL(epubBlob);

      // Usar a API de downloads se disponível, senão fallback para link de download
      if (chrome?.downloads?.download) {
        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: false
        }, () => {
          setStatus({ state: 'ready' });
          setDownloadSuccess(true);
        });
      } else {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatus({ state: 'ready' });
        setDownloadSuccess(true);
      }
    } catch (err: any) {
      setStatus({
        state: 'error',
        errorMessage: `Erro ao gerar EPUB: ${err.message || 'Falha desconhecida.'}`
      });
    }
  };

  const handleOpenSendToKindle = () => {
    const url = 'https://www.amazon.com/sendtokindle';
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="flex flex-col min-h-[520px] bg-white text-slate-800">
      {/* Header */}
      <header className="px-5 py-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-amber-500 rounded-lg text-slate-950 font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              Web to Kindle
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                EPUB
              </span>
            </h1>
            <p className="text-xs text-slate-400">Leitura confortável no seu Kindle</p>
          </div>
        </div>

        <button
          onClick={extractContentFromActiveTab}
          disabled={status.state === 'extracting' || status.state === 'generating'}
          title="Recarregar análise da página"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${status.state === 'extracting' ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        {/* Loading State */}
        {status.state === 'extracting' && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-700">{status.progressMessage}</p>
            <p className="text-xs text-slate-400 mt-1">Limpando anúncios, barras laterais e formatação...</p>
          </div>
        )}

        {/* Error State */}
        {status.state === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-red-50 text-red-600 rounded-full mb-3">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Não foi possível extrair o artigo</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-4">
              {status.errorMessage}
            </p>
            <button
              onClick={extractContentFromActiveTab}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Ready / Success / Generating States */}
        {(status.state === 'ready' || status.state === 'generating' || downloadSuccess) && article && (
          <div className="space-y-4">
            {/* Metadata Stats Card */}
            <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-lg text-slate-600">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span><strong>{article.readingTimeMinutes} min</strong> de leitura</span>
              </div>
              <div className="text-slate-300">•</div>
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{article.wordCount.toLocaleString('pt-BR')} palavras</span>
              </div>
              <div className="text-slate-300">•</div>
              <div className="truncate max-w-[120px] font-medium text-slate-500" title={article.siteName || ''}>
                {article.siteName || 'Web'}
              </div>
            </div>

            {/* Editable Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título do Livro/Artigo
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={status.state === 'generating'}
                  placeholder="Título do artigo"
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Autor / Veículo
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={status.state === 'generating'}
                  placeholder="Nome do autor ou publicação"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all bg-white"
                />
              </div>
            </div>

            {/* Formatting Options */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <span>Embutir imagens do artigo</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeImages}
                    onChange={(e) => setIncludeImages(e.target.checked)}
                    disabled={status.state === 'generating'}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Bookmark className="w-4 h-4 text-slate-400" />
                  <span>Gerar capa tipográfica elegante</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addCoverPage}
                    onChange={(e) => setAddCoverPage(e.target.checked)}
                    disabled={status.state === 'generating'}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            </div>

            {/* Generating Progress Bar */}
            {status.state === 'generating' && (
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-lg text-amber-900 text-xs space-y-2 animate-pulse">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                    {status.progressMessage}
                  </span>
                  {progress && (
                    <span>{progress.current} / {progress.total}</span>
                  )}
                </div>
                {progress && (
                  <div className="w-full bg-amber-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}

            {/* Download Success Banner */}
            {downloadSuccess && status.state !== 'generating' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-emerald-900 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Arquivo EPUB baixado com sucesso!</p>
                  <p className="text-emerald-700 mt-0.5">
                    O arquivo está na sua pasta de Downloads, pronto para ser enviado para o Kindle.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 space-y-2 pt-3 border-t border-slate-100">
          <button
            onClick={handleGenerateEpub}
            disabled={status.state === 'extracting' || status.state === 'generating' || !article}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all ${
              status.state === 'generating'
                ? 'bg-amber-400 text-slate-900 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 hover:shadow'
            }`}
          >
            {status.state === 'generating' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Criando EPUB...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Baixar EPUB para Kindle
              </>
            )}
          </button>

          <button
            onClick={handleOpenSendToKindle}
            className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 active:scale-[0.99] border border-slate-200 rounded-lg text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Abrir Amazon Send to Kindle Web</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
