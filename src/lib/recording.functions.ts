import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withoutDuplicatedHook } from "@/lib/recording-script";
import { MAX_TEXT_CHARS, chunkText, recalcularTempos } from "@/lib/script-chunking";

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
    console.error("[recording-script] gateway", res.status, detail.slice(0, 500));
    if (res.status === 429) throw new Error("A IA está sobrecarregada no momento. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA do espaço de trabalho acabaram. Adicione créditos para continuar.");
    throw new Error("Não foi possível gerar o roteiro. Tente novamente.");
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

/** Chamada de texto simples (sem schema), usada para condensar pedaços de texto grande. */
async function callLovableAiPlainText(prompt: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A inteligência artificial não está configurada.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", input: prompt, stream: true, reasoning: { effort: "low" } }),
  });
  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error("A IA está sobrecarregada no momento. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA do espaço de trabalho acabaram. Adicione créditos para continuar.");
    throw new Error("Não foi possível processar o texto enviado. Tente novamente.");
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
  return { texto: text.trim(), usage };
}

/** Roteiro em texto corrido, usado no teleprompter e como referência do job. */
export function composeRecordingScript(r: RoteiroGravacao) {
  const blocos = r.blocos.map((b) => `${b.tempo} — ${b.orientacao}\n${b.fala}`).join("\n\n");
  return `GANCHO (0-3s)\n${r.gancho}\n\nCORPO\n${blocos}\n\nCTA\n${r.cta}`;
}

/**
 * Modo "Organizar meu roteiro": a IA não reescreve o texto do cliente, apenas
 * distribui a fala nos blocos de tempo. Textos grandes são processados em
 * pedaços e depois reunidos num roteiro só, com os tempos recalculados aqui.
 */
async function organizarRoteiroEnviado(params: {
  origem: string;
  idioma: string;
  tom: string;
  perfil: string;
  categoria: string;
  tipoCta: string;
  jaDefinido: { gancho: string; cta: string; caption: string; hashtags: string[]; textoTela: string };
  somarUso: (u: { input: number; output: number }) => void;
}): Promise<RoteiroGravacao> {
  const partes = chunkText(params.origem);
  const resultados: RoteiroGravacao[] = [];

  for (const [i, parte] of partes.entries()) {
    const prompt = [
      `Você organiza roteiros de vídeo curto (TikTok) para o perfil "${params.perfil}" (nicho: ${params.categoria}), em ${params.idioma}, tom ${params.tom}.`,
      "",
      "REGRA PRINCIPAL: o roteiro abaixo foi escrito pelo próprio criador. Você NÃO reescreve, NÃO resume, NÃO inventa e NÃO troca as palavras dele.",
      "Sua única tarefa é ORGANIZAR: separar a fala em blocos de tempo em sequência, mantendo as frases originais na mesma ordem.",
      "Pode apenas: remover marcações do documento (títulos de seção, numeração, anotações entre colchetes), corrigir pontuação evidente e juntar/quebrar frases para encaixar nos blocos.",
      "",
      partes.length > 1
        ? `Este é o pedaço ${i + 1} de ${partes.length} do roteiro. Organize SOMENTE o texto deste pedaço; os outros pedaços são tratados separadamente.`
        : "Organize o roteiro inteiro.",
      i > 0 ? "Como não é o primeiro pedaço, deixe o campo gancho vazio." : "",
      i < partes.length - 1 ? "Como não é o último pedaço, deixe o campo cta vazio." : "",
      "",
      "Campos auxiliares (titulo, gancho, cta, caption, hashtags, texto_tela e a orientacao de cada bloco):",
      "- Se o próprio texto enviado já trouxer esse elemento (ex: uma linha marcada como GANCHO, CTA, LEGENDA, HASHTAGS ou indicações de cena), use exatamente o que veio.",
      "- Se não trouxer, sugira algo curto e coerente com o roteiro.",
      `- Para o CTA: ${params.tipoCta}`,
      "- O campo 'orientacao' é uma dica de cena/ação, nunca a fala.",
      "- O campo 'tempo' pode ser aproximado; os segundos finais são recalculados depois pelo sistema.",
      "",
      "ROTEIRO DO CRIADOR:",
      parte,
    ]
      .filter(Boolean)
      .join("\n");

    const { roteiro, usage } = await callLovableAi(prompt);
    params.somarUso(usage);
    resultados.push(roteiro);
  }

  const primeiro = resultados[0];
  const ultimo = resultados[resultados.length - 1];
  const blocos = resultados.flatMap((r) => r.blocos).filter((b) => b.fala.trim());
  const gancho = params.jaDefinido.gancho || primeiro?.gancho || "";
  const hashtags = params.jaDefinido.hashtags.length
    ? params.jaDefinido.hashtags
    : [...new Set(resultados.flatMap((r) => r.hashtags))].slice(0, 12);

  return {
    titulo: primeiro?.titulo ?? "",
    gancho,
    blocos: recalcularTempos(withoutDuplicatedHook(gancho, blocos)),
    texto_tela: params.jaDefinido.textoTela || primeiro?.texto_tela || "",
    cta: params.jaDefinido.cta || ultimo?.cta || primeiro?.cta || "",
    caption: params.jaDefinido.caption || resultados.map((r) => r.caption).find(Boolean) || "",
    hashtags,
  };
}

async function assertCanEdit(supabase: any, profileId: string) {
  const { data: canEdit, error } = await supabase.rpc("can_edit_pipeline", { _profile_id: profileId });
  if (error) throw new Error(error.message);
  if (!canEdit) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
}

const TEXTO_GRANDE_DEMAIS =
  "Esse texto é maior do que conseguimos processar de uma vez. Divida em partes menores e crie um vídeo para cada parte.";

/** Valida textos livres sem mostrar mensagem técnica de limite. */
const textoLivre = (min: number, rotuloCurto: string) =>
  z
    .string()
    .trim()
    .superRefine((valor, ctx) => {
      if (valor.length < min) ctx.addIssue({ code: z.ZodIssueCode.custom, message: rotuloCurto });
      if (valor.length > MAX_TEXT_CHARS) ctx.addIssue({ code: z.ZodIssueCode.custom, message: TEXTO_GRANDE_DEMAIS });
    });

/** Título curto derivado do texto, já que o assunto pode ser longo. */
function tituloProvisorio(texto: string) {
  const primeira = texto.split(/\n+/).map((l) => l.trim()).find(Boolean) ?? texto.trim();
  return primeira.length > 180 ? `${primeira.slice(0, 177)}...` : primeira;
}

export const createOwnVideoJobInputSchema = z.discriminatedUnion("modo", [
      z.object({
        profileId: z.string().uuid(),
        modo: z.literal("criar"),
        assunto: textoLivre(3, "Conte o assunto do vídeo em pelo menos 3 caracteres."),
      }),
      z.object({
        profileId: z.string().uuid(),
        modo: z.literal("organizar"),
        roteiroOrigem: textoLivre(
          30,
          "Cole, dite ou envie o roteiro que você já tem para a inteligência artificial organizar.",
        ),
      }),
    ]);

/** Origem A: vídeo próprio sobre um assunto livre, sem produto vinculado. */
export const createOwnVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createOwnVideoJobInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.profileId);
    const origem = (data.modo === "organizar" ? data.roteiroOrigem : data.assunto).trim();
    const titulo = tituloProvisorio(origem) || "Vídeo próprio";
    const { data: job, error } = await context.supabase
      .from("jobs")
      .insert({
        profile_id: data.profileId,
        product_id: null,
        status: "produto_escolhido",
        formato: "gravacao",
        title: titulo,
        roteiro_modo: data.modo,
        roteiro_origem: origem || null,
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
      .select("id, product_id, profile_id, status, title, formato, roteiro_modo, roteiro_origem, hook, post_cta, caption, hashtags, texto_tela")
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
    const idioma = identity?.language || "pt-BR";
    const tipoCta = product ? CTA_VENDA : CTA_COMUNIDADE;
    const modo = job.roteiro_modo === "organizar" ? "organizar" : "criar";

    const usage = { input: 0, output: 0 };
    const somarUso = (u: { input: number; output: number }) => {
      usage.input += u.input;
      usage.output += u.output;
    };

    let roteiro: RoteiroGravacao;

    if (modo === "organizar") {
      const origem = (job.roteiro_origem ?? "").trim();
      if (!origem) {
        throw new Error("Não encontramos o roteiro que você enviou. Cole o texto de novo para organizarmos.");
      }
      roteiro = await organizarRoteiroEnviado({
        origem,
        idioma,
        tom: tone,
        perfil: profile?.name ?? "",
        categoria: profile?.niche || "geral",
        tipoCta,
        jaDefinido: {
          gancho: (job.hook ?? "").trim(),
          cta: (job.post_cta ?? "").trim(),
          caption: (job.caption ?? "").trim(),
          hashtags: job.hashtags ?? [],
          textoTela: (job.texto_tela ?? "").trim(),
        },
        somarUso,
      });
    } else {
      let assunto = (job.roteiro_origem ?? job.title ?? "").trim();
      const partes = chunkText(assunto);
      if (partes.length > 1) {
        const resumos: string[] = [];
        for (const [i, parte] of partes.entries()) {
          const { texto, usage: u } = await callLovableAiPlainText(
            `Você está condensando a parte ${i + 1} de ${partes.length} de um material enviado por um criador de conteúdo.\n` +
              `Resuma em tópicos curtos, em ${idioma}, só os pontos úteis para um vídeo curto. Não invente informação.\n\nPARTE:\n${parte}`,
          );
          somarUso(u);
          if (texto) resumos.push(texto);
        }
        assunto = resumos.join("\n\n").slice(0, 12000) || assunto.slice(0, 12000);
      }

      const { resolvePrompt, renderPrompt } = await import("./prompts.server");
      const template = await resolvePrompt(supabase, job.profile_id, "roteiro_gravacao");
      const renderedPrompt = renderPrompt(template, {
        idioma,
        tom_de_voz: tone,
        perfil: profile?.name ?? "",
        categoria: profile?.niche || "geral",
        assunto,
        produto: product?.name ?? "",
        preco: product ? Number(product.price).toFixed(2) : "",
        categoria_produto: product?.niche || "",
        descricao_produto: (product?.description ?? "").slice(0, 2000),
        observacoes_estilo: identity?.style_notes?.trim() ?? "",
        tipo_cta: tipoCta,
      });
      const prompt = `${renderedPrompt}\n\nREGRA OBRIGATÓRIA DE CONTINUIDADE: A fala do gancho (0-3s) já é o início do vídeo. Não repita a fala do gancho, nem uma paráfrase dela, em nenhum bloco de tempo. O primeiro bloco começa em 3s com fala nova e dá continuidade ao gancho.`;

      const { roteiro: generatedRoteiro, usage: u } = await callLovableAi(prompt);
      somarUso(u);
      roteiro = {
        ...generatedRoteiro,
        blocos: withoutDuplicatedHook(generatedRoteiro.gancho, generatedRoteiro.blocos),
      };
    }

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
          metadados: { formato: "gravacao", modo },
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
        titulo: z.string().trim().max(500),
        gancho: z.string().trim().max(3000),
        blocos: z
          .array(
            z.object({
              tempo: z.string().trim().max(40),
              orientacao: z.string().trim().max(1000),
              fala: z.string().trim().max(6000),
            }),
          )
          .max(60),
        textoTela: z.string().trim().max(1000),
        cta: z.string().trim().max(2000),
        caption: z.string().trim().max(10000),
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
    z
      .object({
        jobId: z.string().uuid(),
        extension: z.enum(["webm", "mp4"]).default("webm"),
        kind: z.enum(["original", "editado"]).default("original"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(context.supabase, job.profile_id);

    const path = `gravacoes/${data.jobId}-${data.kind}-${Date.now()}.${data.extension}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("job-media")
      .createSignedUploadUrl(path);
    if (signError || !signed) throw new Error(signError?.message ?? "Não foi possível preparar o envio do vídeo.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const editOperation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trim"), start: z.number().min(0), end: z.number().min(0) }),
  z.object({
    type: z.literal("crop"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  }),
  z.object({ type: z.literal("cut"), start: z.number().min(0), end: z.number().min(0) }),
]);

/**
 * Conclui a gravação. O arquivo original é sempre preservado; quando existe uma
 * versão editada, ela vira o vídeo exibido, sem apagar o original.
 */
export const finishRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        path: z.string().trim().min(3).max(300),
        editedPath: z.string().trim().min(3).max(300).nullish(),
        operations: z.array(editOperation).max(20).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path, video_original_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    for (const candidate of [data.path, data.editedPath]) {
      if (candidate && !candidate.startsWith(`gravacoes/${data.jobId}-`)) throw new Error("Arquivo inválido para este job.");
    }
    await assertCanEdit(context.supabase, job.profile_id);

    const visible = data.editedPath ?? data.path;
    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({
        status: "video_pronto",
        video_path: visible,
        video_original_path: data.path,
        video_edited_path: data.editedPath ?? null,
        video_choice: data.editedPath ? "gravado_editado" : "gravado",
        video_edits: data.operations?.length ? (data.operations as never) : null,
        video_storage_status: "salvo",
        video_storage_error: null,
        recorded_at: new Date().toISOString(),
        render_error: null,
      })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);

    const obsoletos = [job.video_path, job.video_original_path].filter(
      (p): p is string => !!p && p !== visible && p !== data.path,
    );
    if (obsoletos.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: cleanupError } = await supabaseAdmin.storage.from("job-media").remove(obsoletos);
      if (cleanupError) console.error("Falha ao limpar gravação substituída", { jobId: job.id, message: cleanupError.message });
    }
    return { ok: true };
  });

/** Salva uma edição feita depois da gravação, sem tocar no arquivo original. */
export const saveEditedRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        path: z.string().trim().min(3).max(300),
        operations: z.array(editOperation).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path, video_original_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    if (!data.path.startsWith(`gravacoes/${data.jobId}-`)) throw new Error("Arquivo inválido para este job.");
    await assertCanEdit(context.supabase, job.profile_id);

    const original = job.video_original_path ?? job.video_path;
    if (!original) throw new Error("Este vídeo ainda não tem uma gravação original salva.");

    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({
        video_path: data.path,
        video_original_path: original,
        video_edited_path: data.path,
        video_choice: "gravado_editado",
        video_edits: data.operations as never,
      })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);

    if (job.video_path && job.video_path !== original && job.video_path !== data.path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("job-media").remove([job.video_path]);
    }
    return { ok: true };
  });

/** Guarda ajustes ainda não renderizados para que o editor possa retomá-los depois. */
export const saveRecordingOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), operations: z.array(editOperation).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao" || !job.video_path) throw new Error("Este job ainda não tem uma gravação salva.");
    await assertCanEdit(context.supabase, job.profile_id);
    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({ video_edits: data.operations.length ? (data.operations as never) : null })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

/** Descarta a edição e volta a exibir a gravação original. */
export const restoreOriginalRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path, video_original_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(context.supabase, job.profile_id);
    const original = job.video_original_path;
    if (!original) throw new Error("Este vídeo não tem uma versão original separada.");

    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({ video_path: original, video_edited_path: null, video_choice: "gravado", video_edits: null })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);

    if (job.video_path && job.video_path !== original) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("job-media").remove([job.video_path]);
    }
    return { ok: true };
  });

/** Link temporário para assistir/baixar as versões do vídeo próprio. */
export const getRecordingVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select(
        "id, video_path, video_original_path, video_edited_path, video_edits, video_choice, ai_video_path, ai_video_url",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = job as {
      video_path: string | null;
      video_original_path: string | null;
      video_edited_path: string | null;
      video_edits: unknown;
      video_choice: string | null;
      ai_video_path: string | null;
      ai_video_url: string | null;
    } | null;
    const path = row?.video_path ?? null;
    if (!path && !row?.ai_video_path && !row?.ai_video_url) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sign = async (p: string | null) =>
      p ? (await supabaseAdmin.storage.from("job-media").createSignedUrl(p, 60 * 60 * 6)).data?.signedUrl ?? null : null;

    const originalPath = row?.video_original_path ?? path;
    const [active, original, edited, ia] = await Promise.all([
      sign(path),
      sign(originalPath),
      sign(row?.video_edited_path ?? null),
      sign(row?.ai_video_path ?? null),
    ]);
    return {
      url: active,
      originalUrl: original ?? active,
      editedUrl: edited,
      aiUrl: ia ?? row?.ai_video_url ?? null,
      choice: (row?.video_choice ?? "gravado") as "gravado" | "gravado_editado" | "ia",
      edited: !!row?.video_edited_path && originalPath !== path,
      operations: Array.isArray(row?.video_edits) ? row.video_edits : [],
    };
  });

/** Escolhe qual versão do vídeo próprio fica ativa. Nenhuma versão é apagada. */
export const setJobVideoChoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ jobId: z.string().uuid(), choice: z.enum(["gravado", "gravado_editado", "ia"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, status, video_path, video_original_path, video_edited_path, ai_video_path")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado.");
    if (job.formato !== "gravacao") throw new Error("Este job não é do formato Gravar eu mesmo.");
    await assertCanEdit(context.supabase, job.profile_id);

    const destino =
      data.choice === "ia"
        ? job.ai_video_path
        : data.choice === "gravado_editado"
          ? job.video_edited_path
          : (job.video_original_path ?? job.video_path);
    if (!destino) throw new Error("Essa versão do vídeo ainda não está disponível.");

    // Escolher a versão por IA sem ter gravado nada coloca o job na fila de revisão.
    const promover = job.status === "roteiro_pronto" || job.status === "cenas_geradas";
    const { error: updateError } = await context.supabase
      .from("jobs")
      .update({
        video_path: destino,
        video_choice: data.choice,
        ...(promover
          ? { status: "video_pronto" as const, video_storage_status: "salvo", video_storage_error: null }
          : {}),
      })
      .eq("id", data.jobId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, path: destino };
  });

/** Exclui permanentemente um job de gravação e limpa o arquivo privado associado. */
export const deleteRecordingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error: readError } = await context.supabase
      .from("jobs")
      .select("id, profile_id, formato, video_path, video_original_path")
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

    const arquivos = [...new Set([job.video_path, job.video_original_path].filter((p): p is string => !!p))];
    if (arquivos.length) {
      const { error: storageError } = await supabaseAdmin.storage.from("job-media").remove(arquivos);
      if (storageError) console.error("Falha ao limpar gravação excluída", { jobId: job.id, message: storageError.message });
    }

    return { ok: true };
  });
