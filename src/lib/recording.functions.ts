import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Modo "Gravar eu mesmo": a IA gera só o conteúdo textual (roteiro em blocos de
 * tempo) e a pessoa grava no estúdio do navegador. Não chama Gemini, Veo nem
 * JSON2Video — nenhum desses serviços é consumido neste formato.
 */

export type RoteiroBloco = { tempo: string; orientacao: string; fala: string };

export type RoteiroGravacao = {
  titulo: string;
  gancho: string;
  blocos: RoteiroBloco[];
  texto_tela: string;
  cta: string;
  caption: string;
  hashtags: string[];
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string", description: "Título/tema curto do vídeo" },
    gancho: { type: "string", description: "Fala dos primeiros 3 segundos" },
    blocos: {
      type: "array",
      description: "Blocos de tempo em sequência",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tempo: { type: "string", description: 'Faixa de tempo, ex: "3-12s"' },
          orientacao: { type: "string", description: "O que mostrar ou fazer nesse bloco" },
          fala: { type: "string", description: "Fala sugerida do bloco" },
        },
        required: ["tempo", "orientacao", "fala"],
      },
    },
    texto_tela: { type: "string", description: "Texto curto para aparecer na tela" },
    cta: { type: "string", description: "Chamada final falada" },
    caption: { type: "string", description: "Legenda do post" },
    hashtags: { type: "array", items: { type: "string" }, description: "Hashtags sem o símbolo #" },
  },
  required: ["titulo", "gancho", "blocos", "texto_tela", "cta", "caption", "hashtags"],
} as const;

const TONE_LABELS: Record<string, string> = {
  descontraido: "descontraído e informal",
  informativo: "informativo e direto",
  entusiasmado: "entusiasmado e vibrante",
  elegante: "elegante e sofisticado",
  engracado: "bem-humorado",
};

const CTA_VENDA =
  'o vídeo tem produto marcado, então feche apontando para o carrinho do TikTok (ex: "clica no carrinho pra garantir o seu", "tá na sacolinha aqui embaixo"). Nunca fale em afiliado nem comissão.';
const CTA_COMUNIDADE =
  "este vídeo NÃO tem produto anexado. O CTA deve ser de comunidade (seguir o perfil, salvar, comentar, compartilhar). Em nenhum momento cite link, carrinho, sacolinha ou onde comprar.";

/** Chamada de texto no gateway Lovable AI, em streaming, com saída estruturada. */
async function callLovableAi(prompt: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A inteligência artificial não está configurada.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input: prompt,
      stream: true,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "roteiro_gravacao", strict: true, schema } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("A IA está sobrecarregada no momento. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA do espaço de trabalho acabaram. Adicione créditos para continuar.");
    throw new Error(`Não foi possível gerar o roteiro. (${res.status}) ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const usage = { input: 0, output: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        else if (event.type === "response.completed" && event.response?.output_text) text = event.response.output_text;
        const u = event.response?.usage;
        if (u) {
          if (typeof u.input_tokens === "number") usage.input = u.input_tokens;
          if (typeof u.output_tokens === "number") usage.output = u.output_tokens;
        }
      } catch {
        // frames parciais / keep-alive
      }
    }
  }

  const trimmed = text.trim();
  if (!trimmed) throw new Error("A IA não retornou um roteiro. Tente novamente.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("A IA retornou um formato inesperado. Tente novamente.");
  }
  const raw = parsed as Partial<RoteiroGravacao>;
  const roteiro: RoteiroGravacao = {
    titulo: String(raw.titulo ?? ""),
    gancho: String(raw.gancho ?? ""),
    blocos: (Array.isArray(raw.blocos) ? raw.blocos : []).map((b) => ({
      tempo: String(b?.tempo ?? ""),
      orientacao: String(b?.orientacao ?? ""),
      fala: String(b?.fala ?? ""),
    })),
    texto_tela: String(raw.texto_tela ?? ""),
    cta: String(raw.cta ?? ""),
    caption: String(raw.caption ?? ""),
    hashtags: (Array.isArray(raw.hashtags) ? raw.hashtags : []).map((h) => String(h).replace(/^#/, "")).slice(0, 12),
  };
  return { roteiro, usage };
}

/** Roteiro em texto corrido, usado no teleprompter e como referência do job. */
export function composeRecordingScript(r: RoteiroGravacao) {
  const blocos = r.blocos.map((b) => `${b.tempo} — ${b.orientacao}\n${b.fala}`).join("\n\n");
  return `GANCHO (0-3s)\n${r.gancho}\n\nCORPO\n${blocos}\n\nCTA\n${r.cta}`;
}

async function assertCanEdit(supabase: any, profileId: string) {
  const { data: canEdit, error } = await supabase.rpc("can_edit_pipeline", { _profile_id: profileId });
  if (error) throw new Error(error.message);
  if (!canEdit) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
}

/** Origem A: vídeo próprio sobre um assunto livre, sem produto vinculado. */
export const createOwnVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid(), assunto: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.profileId);
    const { data: job, error } = await context.supabase
      .from("jobs")
      .insert({
        profile_id: data.profileId,
        product_id: null,
        status: "produto_escolhido",
        formato: "gravacao",
        title: data.assunto,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { jobId: (job as { id: string }).id };
  });

/** Gera (ou regenera) o conteúdo textual de um job no formato "Gravar eu mesmo". */
export const generateRecordingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, product_id, profile_id, status, title, formato")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Job não encontrado ou sem permissão de acesso.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(supabase, job.profile_id);

    const [{ data: product }, { data: identity }, { data: profile }] = await Promise.all([
      job.product_id
        ? supabase.from("products").select("name, price, niche, description").eq("id", job.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("profile_identities").select("tone, language, style_notes").eq("profile_id", job.profile_id).maybeSingle(),
      supabase.from("profiles").select("name, niche").eq("id", job.profile_id).maybeSingle(),
    ]);

    const tone = TONE_LABELS[identity?.tone ?? "descontraido"] ?? (identity?.tone ?? "descontraído");
    const { resolvePrompt, renderPrompt } = await import("./prompts.server");
    const template = await resolvePrompt(supabase, job.profile_id, "roteiro_gravacao");
    const prompt = renderPrompt(template, {
      idioma: identity?.language || "pt-BR",
      tom_de_voz: tone,
      perfil: profile?.name ?? "",
      categoria: profile?.niche || "geral",
      assunto: job.title ?? "",
      produto: product?.name ?? "",
      preco: product ? Number(product.price).toFixed(2) : "",
      categoria_produto: product?.niche || "",
      descricao_produto: (product?.description ?? "").slice(0, 2000),
      observacoes_estilo: identity?.style_notes?.trim() ?? "",
      tipo_cta: product ? CTA_VENDA : CTA_COMUNIDADE,
    });

    const { roteiro, usage } = await callLovableAi(prompt);

    const { recordConsumo } = await import("./consumo.server");
    for (const [unidade, quantidade] of [
      ["token_input", usage.input],
      ["token_output", usage.output],
    ] as const) {
      if (quantidade > 0) {
        await recordConsumo({
          jobId: job.id,
          profileId: job.profile_id,
          etapa: "roteiro_texto",
          modelo: "gpt-6-astra",
          unidade,
          quantidade,
          metadados: { formato: "gravacao" },
        });
      }
    }

    const nextStatus = job.status === "produto_escolhido" ? "roteiro_pronto" : job.status;
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        title: roteiro.titulo || job.title,
        script: composeRecordingScript(roteiro),
        hook: roteiro.gancho,
        post_cta: roteiro.cta,
        caption: roteiro.caption,
        hashtags: roteiro.hashtags,
        roteiro_blocos: roteiro.blocos as never,
        texto_tela: roteiro.texto_tela,
        status: nextStatus,
      })
      .eq("id", job.id);
    if (updateError) throw new Error(updateError.message);

    return { ...roteiro, status: nextStatus };
  });

/** Salva as edições manuais do kit de roteiro (sem custo). */
export const saveRecordingScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        titulo: z.string().trim().max(300),
        gancho: z.string().trim().max(1000),
        blocos: z
          .array(
            z.object({
              tempo: z.string().trim().max(40),
              orientacao: z.string().trim().max(500),
              fala: z.string().trim().max(2000),
            }),
          )
          .max(12),
        textoTela: z.string().trim().max(500),
        cta: z.string().trim().max(500),
        caption: z.string().trim().max(5000),
        hashtags: z.array(z.string().trim().min(1).max(100)).max(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(context.supabase, job.profile_id);

    const roteiro: RoteiroGravacao = {
      titulo: data.titulo,
      gancho: data.gancho,
      blocos: data.blocos,
      texto_tela: data.textoTela,
      cta: data.cta,
      caption: data.caption,
      hashtags: data.hashtags,
    };

    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({
        title: data.titulo || "Vídeo próprio",
        script: composeRecordingScript(roteiro),
        hook: data.gancho || null,
        post_cta: data.cta || null,
        caption: data.caption || null,
        hashtags: data.hashtags,
        roteiro_blocos: data.blocos as never,
        texto_tela: data.textoTela || null,
      })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

/** URL assinada para o navegador enviar o vídeo gravado direto ao nosso bucket privado. */
export const createRecordingUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), extension: z.enum(["webm", "mp4"]).default("webm") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(context.supabase, job.profile_id);

    const path = `gravacoes/${data.jobId}-${Date.now()}.${data.extension}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("job-media")
      .createSignedUploadUrl(path);
    if (signError || !signed) throw new Error(signError?.message ?? "Não foi possível preparar o envio do vídeo.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/** Conclui a gravação: o arquivo enviado vira o vídeo do job e entra na fila de rascunhos. */
export const finishRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), path: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    if (!data.path.startsWith(`gravacoes/${data.jobId}-`)) throw new Error("Arquivo inválido para este job.");
    await assertCanEdit(context.supabase, job.profile_id);

    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({
        status: "video_pronto",
        video_path: data.path,
        video_storage_status: "salvo",
        video_storage_error: null,
        recorded_at: new Date().toISOString(),
        render_error: null,
      })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

/** Link temporário para assistir/baixar o vídeo gravado. */
export const getRecordingVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, video_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const path = (job as { video_path: string | null } | null)?.video_path ?? null;
    if (!path) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage.from("job-media").createSignedUrl(path, 60 * 60 * 6);
    return { url: signed?.signedUrl ?? null };
  });

/** Exclui permanentemente um job de gravação e limpa o arquivo privado associado. */
export const deleteRecordingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error: readError } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!job) throw new Error("Vídeo não encontrado ou sem permissão de acesso.");
    if (job.formato !== "gravacao") throw new Error("Somente vídeos do formato Gravar eu mesmo podem ser removidos por esta ação.");
    await assertCanEdit(context.supabase, job.profile_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("jobs")
      .delete()
      .eq("id", job.id)
      .eq("profile_id", job.profile_id)
      .select("id")
      .maybeSingle();
    if (deleteError) throw new Error(deleteError.message);
    if (!deleted) throw new Error("Você não tem permissão para remover conteúdo deste perfil.");

    if (job.video_path) {
      const { error: storageError } = await supabaseAdmin.storage.from("job-media").remove([job.video_path]);
      if (storageError) console.error("Falha ao limpar gravação excluída", { jobId: job.id, message: storageError.message });
    }

    return { ok: true };
  });
