# Módulo Importador de Catálogos Oficiais (Fase 2)

Este submódulo é totalmente isolado do painel principal e destina-se a realizar o processamento de catálogos oficiais em PDF, renderizando suas páginas em imagens, detectando automaticamente fotos de ambientes reais com IA Vision (GPT-4o-mini), recortando as imagens com Sharp, e salvando no Supabase Storage e Banco de Dados.

## Diretrizes de Ingestão e Processamento (Primeiro Teste)

1. **Limites do Teste**: Limite máximo de **1 PDF**, **3 páginas** e **10 recortes no total** em toda a execução.
2. **Proteção de Tamanho**: Ignora automaticamente PDFs maiores do que **150 MB** no primeiro teste para evitar estouro de memória e lentidão.
3. **Resiliência e Fallback**: A imagem original da página inteira é **sempre** salva no storage e banco de dados **antes** de qualquer tentativa de crop.
4. **Log de Execução**: Cada execução gera automaticamente um log JSON detalhado na pasta `catalogo-service/logs/` contendo horário, PDF utilizado, páginas processadas, quantidade de recortes, falhas ocorridas e a confiança detalhada de cada detecção.
5. **Proteção contra Sobrescrita**: Arquivos no Supabase Storage não serão sobrescritos se já existirem. O uploader buscará sua URL pública atual.
6. **Acurácia**: Nunca inventa produtos, especificações ou imagens.

## Estrutura do Submódulo

- `src/supabaseClient.js`: Inicializador do cliente Supabase.
- `src/listarCatalogos.js`: Lista PDFs disponíveis no bucket Supabase com filtro de tamanho máximo.
- `src/extratorPdf.js`: Faz download local temporário de arquivos PDF.
- `src/renderizadorPaginas.js`: Converte páginas do PDF em imagens PNG de alta resolução.
- `src/recortadorAmbientes.js`: Detecção visual via GPT-4o-mini Vision (OpenAI) e recorte via Sharp.
- `src/uploaderStorage.js`: Envia as páginas inteiras e os ambientes recortados para o Supabase Storage.
- `src/importadorPortinari.js`: Orquestrador principal do pipeline de importação.
- `logs/`: Pasta onde ficam registrados os arquivos JSON de telemetria das execuções.

## Configuração

1. Entre na pasta do serviço:
   ```bash
   cd catalogo-service
   ```
2. Instale as dependências isoladas:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` baseado no `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Preencha as credenciais do Supabase e OpenAI no arquivo `.env` recém-criado.

## Executando o Importador (Primeiro Teste)

Para rodar o importador de testes limitado a 3 páginas:
```bash
npm start
```
