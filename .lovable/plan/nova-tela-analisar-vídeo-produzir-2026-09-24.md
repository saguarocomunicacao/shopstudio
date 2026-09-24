# Nova tela "Analisar vídeo" (Produzir)

## O que o usuário vai ver
- Item "Analisar vídeo" no grupo Produzir, depois de Vídeos (ícone vídeo + lupa).
- Lista de análises do perfil do topo: miniatura do gancho, título/arquivo, origem, duração, data, status, custo, ações (abrir, reanalisar, remover). Botão "Nova análise".
- Painel de envio com abas "Enviar arquivo" (MP4/MOV/WEBM até 200 MB) e "Link do YouTube"; campo opcional "O que você quer saber?"; estimativa de custo e botão "Analisar". Links TikTok/Instagram mostram "Por enquanto só YouTube ou arquivo".
- Status ao vivo: enviando, analisando, pronto, erro (com "Tentar novamente") e notificação ao concluir.
- Detalhe: player (arquivo) ou embed do YouTube à esquerda; abas Resumo, Cenas, Transcrição (clique pula o player), Gancho e CTA, Produto; "Copiar" em cada bloco e "Baixar JSON". Mobile: player em cima.
- Prompt "Análise de vídeo" editável em Prompts do sistema, com override por perfil.
- Assistente ganha listar_analises e detalhe_analise.

## Cobrança
- Nova ação "Análise de vídeo" no catálogo de pacotes (preço zero = ilimitado). Trava de saldo antes de rodar, débito de 1 unidade e registro de tokens em consumo com etapa "analise_video".

## Detalhes técnicos
- Migration: tabela `video_analises` (tenant, perfil, origem, url/storage_path, título, duração, status, erro, pergunta, resultado jsonb, frames jsonb, consumo_evento_id), GRANTs + RLS por tenant/perfil igual a jobs; enum de ação/etapa estendidos; prompt_template `analise_video`; tarifa e taxa de crédito.
- Bucket privado `video-analises` (200 MB) com RLS por tenant.
- Server fn inicia a análise e processa em segundo plano (waitUntil), atualizando status; realtime na tabela.
- IA: Gemini via Lovable AI (`google/gemini-3.8-flash`, chat completions) com saída estruturada validada por zod, 1 retentativa.
  - Arquivo: URL assinada do storage enviada como parte de vídeo.
  - YouTube: URL enviada como parte de vídeo. Se o gateway recusar links do YouTube, a análise termina com erro amigável e isso fica registrado como limitação.
- Frames: após o resultado, o navegador extrai um frame 320px no início de cada cena (reuso de `captureVideoThumbnail`) e salva no bucket. YouTube só mostra tempos clicáveis.
- Sem criação de job/roteiro nesta versão.
