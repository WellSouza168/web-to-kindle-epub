# 📚 Web to Kindle EPUB (Extensão de Navegador)

Extensão de navegador (Manifest V3) que transforma artigos da web em arquivos `.epub` perfeitamente limpos, diagramados e otimizados para leitura no Kindle (via **Amazon Send to Kindle**).

---

## ✨ Funcionalidades

- **Extração com Mozilla Readability:** Isola o artigo eliminando propagandas, barras laterais, popups de newsletter e menus.
- **Formatação Otimizada para E-Ink:** Tipografia em escala com fontes legíveis (Bookerly / Georgia), entrelinhamento e margens ajustadas para telas de e-ink.
- **Tratamento Inteligente de Imagens:** Baixa e redimensiona as imagens do artigo, convertendo para JPEG padrão e embutindo no arquivo (com opção de desativar para gerar arquivos ultraleves).
- **Capa Tipográfica Elegante:** Gera uma capa com o título, autor, veículo original, data e tempo estimado de leitura.
- **100% Client-Side:** Todo o processamento ocorre no próprio navegador. Zero dados enviados para servidores externos, privacidade total e custo zero.
- **Compatibilidade Rigorosa com o Kindle:**
  - `mimetype` uncomprimido na primeira posição do pacote ZIP.
  - Especificação mista **EPUB 3 + EPUB 2 (NCX)** para compatibilidade em qualquer geração de Kindle (Paperwhite, Oasis, Scribe, app móvel).
  - Sanitização estrita de XHTML para evitar rejeição no serviço Send to Kindle da Amazon.

---

## 🚀 Como Instalar no Google Chrome / Microsoft Edge / Brave

1. Abra o navegador e acesse a página de extensões:
   - **Google Chrome:** `chrome://extensions`
   - **Microsoft Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
2. Ative a chave **"Modo do desenvolvedor"** (canto superior direito).
3. Clique no botão **"Carregar sem compactação"** (ou *"Load unpacked"*).
4. Selecione a pasta **`dist`** que está dentro deste projeto:
   ```
   c:\Users\Well_\Documents\antigravity\modest-turing\dist
   ```
5. A extensão **Web to Kindle EPUB** estará instalada e pronta para uso! Fixe o ícone na barra de ferramentas para acesso rápido.

---

## 📖 Como Usar

1. Navegue até qualquer artigo de interesse na internet (notícias, blogs, Medium, Wikipedia, etc.).
2. Clique no ícone da extensão na barra do navegador.
3. O popup exibirá automaticamente:
   - Título e autor (editáveis).
   - Tempo estimado de leitura e contagem de palavras.
   - Opções para incluir imagens e gerar capa.
4. Clique em **"Baixar EPUB para Kindle"**.
5. Para enviar ao Kindle:
   - Clique em **"Abrir Amazon Send to Kindle Web"** direto no popup.
   - Arraste o arquivo `.epub` baixado para a página da Amazon.
   - Em poucos segundos, o artigo estará sincronizado no seu dispositivo Kindle com capa, sumário e imagens!

---

## 🛠️ Comandos de Desenvolvimento

- **Instalar dependências:** `npm install`
- **Compilar para produção:** `npm run build`
- **Testar estrutura do EPUB:** `node scripts/test-epub-structure.js`
