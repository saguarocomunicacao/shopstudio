# Fila de Rascunhos — kit de postagem

Transformar a tela "Rascunhos" (hoje vazia) na última etapa da esteira: cada vídeo pronto vira um kit pronto para postar no TikTok pelo celular.

## 1. Guardar o vídeo com a gente

Hoje o link do vídeo aponta para o serviço de renderização, que apaga o arquivo em 7 dias.

- Assim que o vídeo fica pronto, o arquivo e a miniatura são baixados e guardados no nosso armazenamento privado.
- O player e o botão de baixar sempre usam o nosso arquivo, com link temporário renovado a cada abertura.
- Se a cópia falhar, o rascunho mostra "Vídeo ainda não salvo" com um botão para tentar de novo (e uma nova tentativa automática ao abrir o rascunho).

## 2. A fila

- Lista os vídeos do perfil ativo, em três estados: Aguardando revisão → Aprovado → Publicado.
- Cartões com miniatura, título, produto, data e selo de estado; abas/filtro por estado.
- Estados vazios no mesmo padrão das outras telas (sem perfil selecionado / nenhum rascunho).

## 3. Kit de postagem (modal do rascunho)

Blocos empilhados, pensados para o celular, cada um com botão de copiar grande:

- Vídeo: player vertical + botão destacado "Baixar vídeo".
- Legenda/descrição do roteiro.
- Hashtags (copiar todas de uma vez).
- Título/gancho, quando existir.
- Link do produto (afiliado), com o lembrete: "Cole/anexe este produto no TikTok ao publicar (passo manual)".

## 4. Revisão e publicação

- "Aprovar" (quando aguardando revisão) e "Marcar como publicado", que pede opcionalmente o link do post no TikTok.
- "Rejeitar / refazer": devolve o job ao pipeline com um motivo, ou descarta.
- Se o perfil tiver "Revisão obrigatória" ligada, só é possível marcar como publicado depois de aprovar. Esse interruptor passa a ser salvo de verdade no perfil (hoje é só visual).

## Detalhes técnicos

- Migração: `jobs.video_path`, `jobs.video_thumbnail_path`, `jobs.published_url`, `jobs.approved_at`, `jobs.published_at`, `jobs.rejection_reason`; `profile_video_settings.require_review boolean not null default true`. Sem drops; GRANTs já existentes nas tabelas.
- Webhook `json2video-webhook.$token.ts`: após marcar `video_pronto`, baixa o mp4 e a thumb e chama `storeMedia("videos/{jobId}.mp4" / "thumbs/{jobId}.jpg")`, gravando os caminhos. Falha no download não bloqueia o job.
- Novo `src/lib/drafts.functions.ts` (createServerFn + `requireSupabaseAuth`): `getDraftKit` (assina URLs via `refreshMediaUrl`/`createSignedUrl`, devolve legenda, hashtags, título e link do produto), `ensureDraftVideoStored` (rebaixa se faltar), `approveDraft`, `markDraftPublished({ url? })`, `rejectDraft({ reason, descartar })`.
- Estados reutilizam o enum existente: `video_pronto` = aguardando revisão, `rascunho_enviado` = aprovado, `publicado`.
- Nova UI em `src/components/drafts-page.tsx` (lista + `DraftKitDialog`), substituindo o `DraftsPage` vazio de `studio-pages.tsx`; estilo e magenta #FE2C55 atuais, `ProfileGate` e `useStudio` como nas outras telas.
