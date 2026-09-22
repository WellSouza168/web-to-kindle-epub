import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  FileText,
  Download,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  BookMarked,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Library
} from 'lucide-react';
import { ArticleMetadata, BookPublication, CoverTheme, ExtractionStatus, DetectedEdition } from '../lib/types';
import { extractArticleFromHtml } from '../lib/readability';
import { detectEditionArticles, isLikelyEditionUrl } from '../lib/edition-detector';
import { fetchEditionArticlesBatch, fetchEditionCoverDataUrl } from '../lib/batch-fetcher';
import { extractAndProcessImages } from '../lib/image-fetcher';
import { generateKindleEpub, generatePublicationEpub } from '../lib/epub-generator';
import { generateBookCover } from '../lib/cover-generator';
import {
  loadPublication,
  savePublication,
  addArticleToPublication,
  removeArticleFromPublication,
  reorderArticlesInPublication,
  clearPublication,
  importEditionToPublication,
  DEFAULT_PUBLICATION
} from '../lib/book-storage';

export const App: React.FC = () => {
  // Controle de abas: 'current' (Artigo Atual) ou 'book' (Meu Livro / Coletânea)
  const [activeTab, setActiveTab] = useState<'current' | 'book'>('current');

  // Modo de visualização na aba 'current': 'article' (Artigo Individual) ou 'edition' (Edição Completa)
  const [viewMode, setViewMode] = useState<'article' | 'edition'>('article');

  // Estado do Artigo Atual
  const [article, setArticle] = useState<ArticleMetadata | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>({ state: 'extracting', progressMessage: 'Analisando artigo na página...' });
  const [singleTitle, setSingleTitle] = useState('');
  const [singleAuthor, setSingleAuthor] = useState('');
  const [includeImages, setIncludeImages] = useState(true);
  const [addCoverPage, setAddCoverPage] = useState(true);

  // Estado de Edição de Revista Detectada (Batch Importer)
  const [detectedEdition, setDetectedEdition] = useState<DetectedEdition | null>(null);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [batchSuccessToast, setBatchSuccessToast] = useState(false);

  // Estado da Coletânea / Livro
  const [publication, setPublication] = useState<BookPublication>(DEFAULT_PUBLICATION);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>('');
  const [bookProgress, setBookProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  // Notificações / Feedbacks
  const [addedSuccessToast, setAddedSuccessToast] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicialização
  useEffect(() => {
    extractContentFromActiveTab();
    refreshPublication();
  }, []);

  // Atualizar preview da capa sempre que a publicação mudar
  useEffect(() => {
    let isMounted = true;
    generateBookCover(publication, publication.cover)
      .then((res) => {
        if (isMounted) setCoverPreviewUrl(res.dataUrl);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [publication.title, publication.subtitle, publication.author, publication.cover, publication.articles.length]);

  const refreshPublication = async () => {
    const loaded = await loadPublication();
    setPublication(loaded);
  };

  const extractContentFromActiveTab = async () => {
    setStatus({ state: 'extracting', progressMessage: 'Lendo conteúdo da página atual...' });
    setDownloadSuccessToast(false);

    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        loadDemoArticle();
        return;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTabInfo = tabs[0];

      if (!activeTabInfo || !activeTabInfo.id || !activeTabInfo.url) {
        throw new Error('Não foi possível identificar a aba ativa.');
      }

      if (
        activeTabInfo.url.startsWith('chrome://') ||
        activeTabInfo.url.startsWith('edge://') ||
        activeTabInfo.url.startsWith('about:')
      ) {
        throw new Error('Páginas de sistema do navegador não podem ser convertidas em artigos.');
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTabInfo.id },
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

      const parser = new DOMParser();
      const doc = parser.parseFromString(pageData.html, 'text/html');

      // 1. Verificar se a página atual é um índice/sumário de edição de revista
      const detected = detectEditionArticles(doc, pageData.url);
      setDetectedEdition(detected);

      // 2. Extrair artigo individual via Readability
      const parsed = extractArticleFromHtml(pageData.html, pageData.url);
      if (parsed) {
        setArticle(parsed);
        setSingleTitle(parsed.title);
        setSingleAuthor(parsed.byline || parsed.siteName || '');
        if (detected) {
          const isUrlEdition = isLikelyEditionUrl(new URL(pageData.url));
          setViewMode(isUrlEdition ? 'edition' : 'article');
        } else {
          setViewMode('article');
        }
        setStatus({ state: 'ready' });
      } else if (detected) {
        // Se a página for um índice de edição sem um artigo individual longo
        setArticle(null);
        setViewMode('edition');
        setStatus({ state: 'ready' });
      } else {
        throw new Error('Não foi detectado um artigo principal ou edição nesta página.');
      }
    } catch (err: any) {
      setStatus({
        state: 'error',
        errorMessage: err.message || 'Erro inesperado ao extrair conteúdo.'
      });
    }
  };

  // Alternar seleção de matéria na lista da edição
  const handleToggleArticleSelection = (articleId: string) => {
    if (!detectedEdition) return;
    setDetectedEdition({
      ...detectedEdition,
      articles: detectedEdition.articles.map((a) =>
        a.id === articleId ? { ...a, selected: !a.selected } : a
      )
    });
  };

  const handleSelectAllArticles = () => {
    if (!detectedEdition) return;
    setDetectedEdition({
      ...detectedEdition,
      articles: detectedEdition.articles.map((a) => ({ ...a, selected: true }))
    });
  };

  const handleDeselectAllArticles = () => {
    if (!detectedEdition) return;
    setDetectedEdition({
      ...detectedEdition,
      articles: detectedEdition.articles.map((a) => ({ ...a, selected: false }))
    });
  };

  // Importar edição completa em lote para a aba "Meu Livro"
  const handleImportBatchEdition = async () => {
    if (!detectedEdition) return;

    const selectedArticles = detectedEdition.articles.filter((a) => a.selected);
    if (selectedArticles.length === 0) return;

    setIsBatchImporting(true);
    setBatchProgress({ current: 0, total: selectedArticles.length, title: 'Iniciando download da edição...' });

    try {
      // 1. Fazer download da capa oficial da edição, se disponível
      let coverDataUrl: string | undefined = undefined;
      if (detectedEdition.coverImageUrl) {
        setBatchProgress({ current: 0, total: selectedArticles.length, title: 'Carregando capa oficial da revista...' });
        const res = await fetchEditionCoverDataUrl(detectedEdition.coverImageUrl);
        if (res) coverDataUrl = res;
      }

      // 2. Fazer download e extração em lote de todas as matérias
      const downloadedArticles = await fetchEditionArticlesBatch(
        detectedEdition.articles,
        (current, total, articleTitle) => {
          setBatchProgress({ current, total, title: `Baixando (${current}/${total}): ${articleTitle}` });
        }
      );

      // 3. Importar para a publicação
      const updated = await importEditionToPublication(
        detectedEdition.title,
        detectedEdition.subtitle || 'Edição Completa',
        detectedEdition.siteName,
        coverDataUrl,
        downloadedArticles
      );

      setPublication(updated);
      setIsBatchImporting(false);
      setBatchProgress(null);
      setBatchSuccessToast(true);

      // Redirecionar diretamente para a aba "Meu Livro" para revisão e download do EPUB
      setActiveTab('book');
      setTimeout(() => setBatchSuccessToast(false), 4000);
    } catch (err: any) {
      console.error('[Batch Import] Erro durante a importação da edição:', err);
      setIsBatchImporting(false);
      setBatchProgress(null);
    }
  };

  const loadDemoArticle = () => {
    const demo: ArticleMetadata = {
      title: 'Inconsciente – O iceberg sob a água',
      byline: 'Revista Super',
      siteName: 'super.abril.com.br',
      excerpt: 'Como a descoberta do inconsciente transformou a compreensão da mente humana.',
      url: 'https://super.abril.com.br/historia/inconsciente-o-iceberg-sob-a-agua',
      readingTimeMinutes: 26,
      wordCount: 4200,
      contentHtml: `
        <p>A mente humana guarda segredos profundos que Freud comparou a um iceberg: a maior parte permanece oculta sob a superfície d'água.</p>
        <h2>O Princípio do Prazer</h2>
        <p>Nossos impulsos mais primitivos buscam gratificação imediata, moldando nossas ações de maneiras sutis.</p>
        <blockquote>"O ego não é o senhor em sua própria casa." — Sigmund Freud</blockquote>
        <p>A teoria psicanalítica continua influenciando a arte, a literatura e a compreensão moderna de quem somos.</p>
      `,
      textContent: 'A mente humana guarda segredos profundos...'
    };
    setArticle(demo);
    setSingleTitle(demo.title);
    setSingleAuthor(demo.byline || '');
    setViewMode('article');
    setStatus({ state: 'ready' });
  };

  // Ação: Adicionar artigo atual à coletânea do livro
  const handleAddToBook = async () => {
    if (!article) return;
    const updated = await addArticleToPublication({
      ...article,
      title: singleTitle.trim() || article.title,
      byline: singleAuthor.trim() || article.byline
    });
    setPublication(updated);
    setAddedSuccessToast(true);
    setTimeout(() => setAddedSuccessToast(false), 3000);
  };

  // Ação: Baixar artigo único
  const handleDownloadSingleArticle = async () => {
    if (!article) return;

    setStatus({ state: 'generating', progressMessage: 'Processando artigo...' });
    setDownloadSuccessToast(false);

    try {
      let finalImages: any[] = [];
      let finalHtml = article.contentHtml;

      if (includeImages) {
        setStatus({ state: 'generating', progressMessage: 'Otimizando imagens...' });
        const imgResult = await extractAndProcessImages(article.contentHtml, article.url);
        finalImages = imgResult.images;
        finalHtml = imgResult.updatedHtml;
      }

      setStatus({ state: 'generating', progressMessage: 'Criando arquivo EPUB para Kindle...' });
      const epubBlob = await generateKindleEpub(
        { ...article, contentHtml: finalHtml },
        {
          title: singleTitle.trim() || article.title,
          author: singleAuthor.trim() || 'Autor Desconhecido',
          includeImages,
          addCoverPage,
          language: 'pt'
        },
        finalImages
      );

      triggerDownload(epubBlob, `${(singleTitle.trim() || 'artigo').replace(/[\\/:*?"<>|]/g, '')}.epub`);
      setStatus({ state: 'ready' });
      setDownloadSuccessToast(true);
    } catch (err: any) {
      setStatus({ state: 'error', errorMessage: err.message || 'Falha ao gerar EPUB.' });
    }
  };

  // Ação: Baixar livro completo com múltiplos capítulos
  const handleDownloadFullBook = async () => {
    if (publication.articles.length === 0) return;

    setStatus({ state: 'generating', progressMessage: 'Iniciando compilação do livro...' });
    setDownloadSuccessToast(false);
    setBookProgress(null);

    try {
      // 1. Gerar imagem de capa em alta resolução (JPEG 1200x1800)
      const cover = await generateBookCover(publication, publication.cover);

      // 2. Gerar o EPUB multi-capítulos
      const epubBlob = await generatePublicationEpub(
        publication,
        cover.data,
        { includeImages },
        (current, total, message) => {
          setBookProgress({ current, total, message });
        }
      );

      // 3. Fazer download
      const safeTitle = (publication.title.trim() || 'Livro-Coletanea')
        .replace(/[\\/:*?"<>|]/g, '')
        .substring(0, 60);
      triggerDownload(epubBlob, `${safeTitle}.epub`);

      setStatus({ state: 'ready' });
      setBookProgress(null);
      setDownloadSuccessToast(true);
    } catch (err: any) {
      setStatus({ state: 'error', errorMessage: err.message || 'Falha ao compilar livro.' });
      setBookProgress(null);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const downloadUrl = URL.createObjectURL(blob);
    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      chrome.downloads.download({
        url: downloadUrl,
        filename,
        saveAs: false
      });
    } else {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Reordenação de capítulos
  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = await reorderArticlesInPublication(index, index - 1);
    setPublication(updated);
  };

  const handleMoveDown = async (index: number) => {
    if (index === publication.articles.length - 1) return;
    const updated = await reorderArticlesInPublication(index, index + 1);
    setPublication(updated);
  };

  const handleRemoveArticle = async (id: string) => {
    const updated = await removeArticleFromPublication(id);
    setPublication(updated);
  };

  const handleClearBook = async () => {
    if (confirm('Tem certeza que deseja limpar todos os artigos da coletânea atual?')) {
      const cleared = await clearPublication();
      setPublication(cleared);
    }
  };

  // Upload de Imagem de Capa Customizada
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const updated = {
        ...publication,
        cover: {
          type: 'custom' as const,
          presetTheme: publication.cover.presetTheme,
          customImageDataUrl: dataUrl
        }
      };
      setPublication(updated);
      await savePublication(updated);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPresetTheme = async (theme: CoverTheme) => {
    const updated = {
      ...publication,
      cover: {
        type: 'preset' as const,
        presetTheme: theme,
        customImageDataUrl: undefined
      }
    };
    setPublication(updated);
    await savePublication(updated);
  };

  // Cálculos de totais
  const totalReadingTime = publication.articles.reduce((acc, a) => acc + a.readingTimeMinutes, 0);
  const formattedReadingTime =
    totalReadingTime >= 60
      ? `${Math.floor(totalReadingTime / 60)}h ${totalReadingTime % 60 > 0 ? (totalReadingTime % 60) + 'm' : ''}`
      : `${totalReadingTime}m`;

  const totalWords = publication.articles.reduce((acc, a) => acc + a.wordCount, 0);

  return (
    <div className="flex flex-col min-h-[580px] bg-white text-slate-800">
      {/* Header Principal com Abas */}
      <header className="px-5 pt-3 pb-0 bg-slate-950 text-white border-b border-slate-800">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-amber-500 rounded-lg text-slate-950 font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Web to Kindle
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                  EPUB
                </span>
              </h1>
            </div>
          </div>

          <button
            onClick={extractContentFromActiveTab}
            disabled={status.state === 'extracting' || status.state === 'generating'}
            title="Recarregar artigo da aba ativa"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status.state === 'extracting' ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex space-x-1 border-t border-slate-800/80 pt-1">
          <button
            onClick={() => setActiveTab('current')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'current'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Artigo Atual</span>
          </button>

          <button
            onClick={() => setActiveTab('book')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'book'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>Meu Livro / Revista</span>
            {publication.articles.length > 0 && (
              <span className="ml-1 bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                {publication.articles.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Conteúdo da Aba 1: Artigo Atual */}
      {activeTab === 'current' && (
        <div className="p-5 flex-1 flex flex-col justify-between">
          {status.state === 'extracting' && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-9 h-9 text-amber-500 animate-spin mb-3" />
              <p className="text-xs font-medium text-slate-700">{status.progressMessage}</p>
              <p className="text-[11px] text-slate-400 mt-1">Limpando banners, propagandas e barras laterais...</p>
            </div>
          )}

          {status.state === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 bg-red-50 text-red-600 rounded-full mb-3">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h3 className="text-xs font-semibold text-slate-800 mb-1">Não foi possível extrair o artigo</h3>
              <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed mb-4">
                {status.errorMessage}
              </p>
              <button
                onClick={extractContentFromActiveTab}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
            </div>
          )}

          {(status.state === 'ready' || status.state === 'generating' || downloadSuccessToast || batchSuccessToast) && (
            <div className="space-y-3.5">
              {/* Seletor Segmentado: Artigo Individual vs. Edição Completa */}
              {article && detectedEdition && (
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('article')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === 'article'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    <span>Artigo Individual</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('edition')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === 'edition'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>Edição Completa ({detectedEdition.articles.length})</span>
                  </button>
                </div>
              )}

              {/* MODO 1: Exibição da Edição de Revista Completa */}
              {viewMode === 'edition' && detectedEdition && (
                <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-50 border border-amber-500/30 rounded-xl p-3.5 space-y-3 shadow-xs">
                  <div className="flex gap-3">
                    {/* Capa da Edição */}
                    {detectedEdition.coverImageUrl ? (
                      <div className="relative shrink-0 w-16 h-24 bg-slate-900 rounded-md overflow-hidden border border-amber-500/40 shadow-sm">
                        <img
                          src={detectedEdition.coverImageUrl}
                          alt="Capa da Edição"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-16 h-24 bg-amber-100 rounded-md flex flex-col items-center justify-center text-amber-800 text-[10px] font-bold border border-amber-300 p-1 text-center">
                        <Library className="w-5 h-5 mb-1 text-amber-600" />
                        Edição
                      </div>
                    )}

                    {/* Título e Metadados da Edição */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>Edição Detectada</span>
                        </div>
                        <h2 className="font-serif font-bold text-sm text-slate-900 truncate leading-snug" title={detectedEdition.title}>
                          {detectedEdition.title}
                        </h2>
                        {detectedEdition.subtitle && (
                          <p className="text-[11px] text-slate-500 italic truncate">
                            {detectedEdition.subtitle}
                          </p>
                        )}
                      </div>

                      <div className="pt-1">
                        <span className="inline-block text-[10px] font-semibold bg-amber-100/90 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300/50">
                          {detectedEdition.articles.filter((a) => a.selected).length} de {detectedEdition.articles.length} matérias selecionadas
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progresso de Download em Lote */}
                  {batchProgress && (
                    <div className="p-2.5 bg-amber-100/90 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1.5 animate-pulse">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-1.5 truncate pr-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                          <span className="truncate">{batchProgress.title}</span>
                        </span>
                        <span className="shrink-0 font-bold">
                          {batchProgress.current} / {batchProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-amber-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round(((batchProgress.current || 0) / (batchProgress.total || 1)) * 100)}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Checklist de Matérias */}
                  <div className="border-t border-amber-500/20 pt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">Matérias da Edição</span>
                      <div className="flex gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={handleSelectAllArticles}
                          disabled={isBatchImporting}
                          className="text-amber-700 hover:text-amber-900 font-medium cursor-pointer"
                        >
                          Marcar todas
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllArticles}
                          disabled={isBatchImporting}
                          className="text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Desmarcar todas
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-[145px] overflow-y-auto pr-1">
                      {detectedEdition.articles.map((art) => (
                        <label
                          key={art.id}
                          className={`flex items-start gap-2 p-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                            art.selected
                              ? 'bg-white border-amber-300/80 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={art.selected}
                            onChange={() => handleToggleArticleSelection(art.id)}
                            disabled={isBatchImporting}
                            className="mt-0.5 w-3.5 h-3.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[11px] text-slate-800 leading-snug truncate" title={art.title}>
                              {art.title}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 mt-0.5">
                              {art.section && (
                                <span className="font-bold text-amber-700 uppercase tracking-wider">
                                  {art.section}
                                </span>
                              )}
                              {art.section && art.byline && <span>•</span>}
                              {art.byline && <span className="truncate">{art.byline}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Botão de Ação do Lote */}
                    <button
                      type="button"
                      onClick={handleImportBatchEdition}
                      disabled={isBatchImporting || detectedEdition.articles.filter((a) => a.selected).length === 0}
                      className="w-full mt-2 py-2 px-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isBatchImporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Importando ({batchProgress?.current || 0}/{batchProgress?.total || 0})...
                        </>
                      ) : (
                        <>
                          <Layers className="w-3.5 h-3.5" />
                          Importar Edição para Meu Livro ({detectedEdition.articles.filter((a) => a.selected).length} Matérias)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Toast de Sucesso do Lote */}
              {batchSuccessToast && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Edição importada com sucesso! Todos os capítulos foram carregados.</span>
                </div>
              )}

              {/* MODO 2: Exibição do Artigo Individual (viewMode === 'article' e artigo existente) */}
              {viewMode === 'article' && article && (
                <>
                  {/* Banner discreto indicando que também há uma edição detectada */}
                  {detectedEdition && (
                    <div className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-900">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">Edição com {detectedEdition.articles.length} matérias disponível nesta página.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewMode('edition')}
                        className="font-bold text-amber-700 hover:text-amber-900 underline shrink-0 cursor-pointer text-[11px]"
                      >
                        Ver Edição
                      </button>
                    </div>
                  )}

                  {/* Card de Métricas do Artigo */}
                  <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-lg text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span><strong>{article.readingTimeMinutes} min</strong></span>
                    </div>
                    <div className="text-slate-300">•</div>
                    <div>{article.wordCount.toLocaleString('pt-BR')} palavras</div>
                    <div className="text-slate-300">•</div>
                    <div className="truncate max-w-[130px] font-medium text-slate-500" title={article.siteName || ''}>
                      {article.siteName || 'Web'}
                    </div>
                  </div>

                  {/* Campos Editáveis */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Título do Artigo
                      </label>
                      <input
                        type="text"
                        value={singleTitle}
                        onChange={(e) => setSingleTitle(e.target.value)}
                        disabled={status.state === 'generating'}
                        className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Autor / Veículo Original
                      </label>
                      <input
                        type="text"
                        value={singleAuthor}
                        onChange={(e) => setSingleAuthor(e.target.value)}
                        disabled={status.state === 'generating'}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* Opções */}
                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 font-medium">Embutir imagens no EPUB</span>
                      <input
                        type="checkbox"
                        checked={includeImages}
                        onChange={(e) => setIncludeImages(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 font-medium">Gerar página inicial de capa</span>
                      <input
                        type="checkbox"
                        checked={addCoverPage}
                        onChange={(e) => setAddCoverPage(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Toasts / Feedback */}
                  {addedSuccessToast && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center gap-2 animate-bounce">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Artigo adicionado com sucesso à sua coletânea!</span>
                    </div>
                  )}

                  {downloadSuccessToast && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Download do EPUB concluído! Salvo em Downloads.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Botões de Ação do Artigo Atual (quando em modo Artigo Individual) */}
          {viewMode === 'article' && article && (
            <div className="mt-5 space-y-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleAddToBook}
                disabled={status.state === 'extracting' || status.state === 'generating'}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                Adicionar este Artigo ao Meu Livro (+1)
              </button>

              <button
                type="button"
                onClick={handleDownloadSingleArticle}
                disabled={status.state === 'extracting' || status.state === 'generating'}
                className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {status.state === 'generating' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Gerando EPUB...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Baixar Apenas este Artigo Individual
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da Aba 2: Meu Livro / Coletânea (Estilo Passages) */}
      {activeTab === 'book' && (
        <div className="p-5 flex-1 flex flex-col justify-between">
          {publication.articles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-amber-50 text-amber-600 rounded-full mb-3">
                <Layers className="w-8 h-8" />
              </div>
              <h3 className="text-xs font-bold text-slate-800 mb-1">Seu Livro está Vazio</h3>
              <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed mb-5">
                Navegue pelos seus artigos ou reportagens favoritas e clique em <strong>"Adicionar este Artigo ao Meu Livro"</strong> para montar uma edição completa.
              </p>
              <button
                onClick={() => setActiveTab('current')}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                Ir para o Artigo Atual
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Card Superior: Preview da Capa e Edição de Título / Subtítulo */}
              <div className="flex gap-4 p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl">
                {/* Miniatura da Capa Estilo Passages */}
                <div className="relative shrink-0 w-24 h-36 bg-slate-900 rounded-lg shadow-md overflow-hidden border border-slate-700/50 group">
                  {coverPreviewUrl ? (
                    <img src={coverPreviewUrl} alt="Capa" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                      Capa
                    </div>
                  )}
                  {/* Botão de trocar imagem por cima */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Carregar imagem própria de capa"
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] transition-opacity cursor-pointer font-medium p-1 text-center"
                  >
                    <Upload className="w-4 h-4 mb-1 text-amber-400" />
                    Alterar Capa
                  </button>
                </div>

                {/* Campos de Título, Subtítulo e Autor */}
                <div className="flex-1 space-y-2">
                  <div className="text-[10px] font-bold tracking-wider uppercase text-amber-600">
                    Publicação • Pronta para Exportar
                  </div>

                  <div>
                    <input
                      type="text"
                      value={publication.title}
                      onChange={async (e) => {
                        const updated = { ...publication, title: e.target.value };
                        setPublication(updated);
                        await savePublication(updated);
                      }}
                      placeholder="Título do Livro (ex: Freud)"
                      className="w-full font-serif font-bold text-base text-slate-900 px-2 py-1 border-b border-slate-300 focus:border-amber-600 focus:outline-none bg-transparent"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={publication.subtitle}
                      onChange={async (e) => {
                        const updated = { ...publication, subtitle: e.target.value };
                        setPublication(updated);
                        await savePublication(updated);
                      }}
                      placeholder="Subtítulo (ex: Para entender de uma vez)"
                      className="w-full italic font-serif text-xs text-slate-600 px-2 py-0.5 border-b border-slate-300 focus:border-amber-600 focus:outline-none bg-transparent"
                    />
                  </div>

                  {/* Seletor de Tema da Capa */}
                  <div className="pt-1 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">Estilo:</span>
                    <button
                      onClick={() => handleSelectPresetTheme('passages-dark')}
                      className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                        publication.cover.type === 'preset' && publication.cover.presetTheme === 'passages-dark'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => handleSelectPresetTheme('classic-light')}
                      className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                        publication.cover.type === 'preset' && publication.cover.presetTheme === 'classic-light'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Clássico
                    </button>
                    <button
                      onClick={() => handleSelectPresetTheme('minimal-slate')}
                      className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                        publication.cover.type === 'preset' && publication.cover.presetTheme === 'minimal-slate'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Slate
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload de foto própria"
                      className={`p-1 rounded text-slate-600 hover:text-amber-600 hover:bg-slate-200 ${
                        publication.cover.type === 'custom' ? 'text-amber-600 bg-amber-100 font-bold' : ''
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Barra de Métricas no Estilo Passages */}
              <div className="flex items-center justify-around py-2 px-3 bg-slate-900 text-white rounded-lg text-center shadow-inner">
                <div>
                  <div className="text-xs font-bold text-amber-400">{publication.articles.length}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Artigos</div>
                </div>
                <div className="h-5 w-[1px] bg-slate-800"></div>
                <div>
                  <div className="text-xs font-bold text-white">{formattedReadingTime}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Leitura</div>
                </div>
                <div className="h-5 w-[1px] bg-slate-800"></div>
                <div>
                  <div className="text-xs font-bold text-slate-200">{totalWords.toLocaleString('pt-BR')}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Palavras</div>
                </div>
              </div>

              {/* Lista de Capítulos Reordenáveis */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-2 px-1">
                  <span>CAPÍTULOS ({publication.articles.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal italic">Use as setas para reordenar</span>
                </div>

                <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                  {publication.articles.map((art, idx) => {
                    const num = String(idx + 1).padStart(2, '0');
                    return (
                      <div
                        key={art.id}
                        className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 rounded-lg text-xs transition-colors group"
                      >
                        <div className="flex items-start gap-2.5 overflow-hidden pr-2">
                          <span className="font-mono text-slate-400 font-bold text-[11px] pt-0.5 shrink-0">
                            {num}.
                          </span>
                          <div className="overflow-hidden">
                            <p className="font-medium text-slate-800 truncate text-[11px]" title={art.title}>
                              {art.title}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {art.siteName || 'Web'} • {art.readingTimeMinutes} min
                            </p>
                          </div>
                        </div>

                        {/* Botões de Ação (Subir, Descer, Remover) */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            title="Subir capítulo"
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-200 transition-colors"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === publication.articles.length - 1}
                            title="Descer capítulo"
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-200 transition-colors"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveArticle(art.id)}
                            title="Remover este capítulo"
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors ml-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progresso de Compilação */}
              {bookProgress && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5 animate-pulse">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      {bookProgress.message}
                    </span>
                    <span>{bookProgress.current} / {bookProgress.total}</span>
                  </div>
                  <div className="w-full bg-amber-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((bookProgress.current / bookProgress.total) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {downloadSuccessToast && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Livro baixado com sucesso! Pronto para o Kindle.</span>
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação do Livro */}
          {publication.articles.length > 0 && (
            <div className="mt-4 space-y-2 pt-3 border-t border-slate-100">
              <button
                onClick={handleDownloadFullBook}
                disabled={status.state === 'generating'}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                {status.state === 'generating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Compilando Livro...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Baixar Livro Completo para Kindle ({publication.articles.length} Capítulos)
                  </>
                )}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const url = 'https://www.amazon.com/sendtokindle';
                    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
                      chrome.tabs.create({ url });
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex-1 py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Amazon Send to Kindle</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </button>

                <button
                  onClick={handleClearBook}
                  disabled={status.state === 'generating'}
                  className="py-1.5 px-2.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-[11px] font-medium transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
