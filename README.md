# 📚 Web to Kindle EPUB (Extensão de Navegador)

Extensão de navegador (Manifest V3) que transforma artigos da web em arquivos `.epub` perfeitamente diagramados e otimizados para leitura no Kindle (via **Amazon Send to Kindle**).

Suporta tanto a conversão de **artigos individuais** quanto a criação de **livros/revistas completos (Estilo Passages)** com múltiplos artigos agrupados em capítulos, capa de alta resolução e sumário interativo.

---

## ✨ Funcionalidades

### 📖 1. Modo Livro / Revista (Estilo Passages)
- **Compilador de Artigos:** Colete matérias enquanto navega na internet e monte edições digitais temáticas (ex: *Edição Freud*, *Série de Tecnologia*, *Revista Semanal*).
- **Capítulos Divididos:** Cada matéria é gravada como um capítulo independente (`Capítulo 01 • Título`), permitindo navegar pelos marcadores de capítulo na barra de leitura do Kindle.
- **Reordenação Flexível:** Use as setas `↑` e `↓` para definir a ordem exata de leitura antes de baixar.
- **Sumário Duplo (EPUB 3 + NCX):** Compatibilidade total com todas as gerações de leitores Kindle (Paperwhite, Oasis, Scribe, apps iOS/Android).
- **Capa Customizável para o Kindle:**
  - **Temas Tipográficos:** *Passages Dark (Noir)*, *Classic Editorial* e *Minimal Slate*.
  - **Upload de Imagem Própria:** Escolha qualquer imagem do seu computador para estampar a capa.
  - **Exibição na Tela de Bloqueio:** Capa registrada como `cover-image` para que o Kindle mostre o livro na grade da biblioteca e na tela de descanso.
- **Métricas Consolidadas:** Exibe total de artigos, tempo somado de leitura (ex: `2h 55m`) e total de palavras.

---

### 📄 2. Modo Artigo Individual
- **Leitura Rápida em 1 Clique:** Baixe imediatamente o artigo que você está lendo com título e autor formatados.
- **Botão "+ Adicionar ao Meu Livro":** Adicione o artigo para ler mais tarde na sua coletânea sem interromper sua navegação.

---

### ⚡ 3. Engenharia e Otimização para E-Ink
- **Motor Mozilla Readability:** Isola o texto relevante e remove popups, anúncios, caixas de comentários e barras de navegação.
- **Tratamento de Imagens:** Baixa e otimiza imagens em JPEG padrão (85%), redimensiona gráficos gigantes e ignora rastreadores invisíveis (<30px).
- **100% Client-Side:** Todo o processamento ocorre no próprio navegador, garantindo privacidade absoluta e zero servidores externos.

---

## 🚀 Como Instalar no Chrome / Edge / Brave

1. Abra o navegador e acesse a página de extensões:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **"Carregar sem compactação"** (*Load unpacked*).
4. Selecione a pasta **`dist`** deste repositório:
   ```
   c:\Users\Well_\Documents\antigravity\modest-turing\dist
   ```
5. A extensão estará instalada! Fixe o ícone na barra de navegação para acesso rápido.

---

## 📖 Como Montar seu Livro (Passo a Passo)

1. Acesse o primeiro artigo na web e clique no ícone da extensão.
2. Clique no botão **"Adicionar este Artigo ao Meu Livro (+1)"**.
   - Note que o ícone da extensão exibirá um contador com a quantidade de artigos salvos.
3. Repita o processo nos demais artigos que deseja incluir na sua edição.
4. Clique na aba **"Meu Livro / Revista"**:
   - Dê um **Título** (ex: *Freud*) e um **Subtítulo** (ex: *Para entender de uma vez*).
   - Escolha o estilo da capa ou carregue uma imagem.
   - Ajuste a ordem dos capítulos com as setas `↑` e `↓`.
5. Clique em **"Baixar Livro Completo para Kindle"**.
6. Clique em **"Amazon Send to Kindle"** e arraste o arquivo `.epub` gerado!

---

## 🛠️ Comandos de Desenvolvimento

- **Instalar:** `npm install`
- **Compilar para produção:** `npm run build`
- **Testar EPUB individual:** `node scripts/test-epub-structure.js`
- **Testar EPUB multi-capítulos:** `node scripts/test-multi-chapter-epub.js`
