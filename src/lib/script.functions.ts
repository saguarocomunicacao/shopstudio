import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TokenUsage = { input: number; output: number };

export type GeneratedScript = {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
};

const TONE_LABELS: Record<string, string> = {
  descontraido: "descontraído e informal",
  informativo: "informativo e direto",
  entusiasmado: "entusiasmado e vibrante",
  elegante: "elegante e sofisticado",
  engracado: "bem-humorado",
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hook: { type: "string", description: "Gancho falado nos primeiros 3 segundos" },
    body: { type: "string", description: "Corpo do roteiro com benefícios e demonstração" },
    cta: { type: "string", description: "Chamada de venda apontando para o produto marcado/carrinho do TikTok" },
    caption: { type: "string", description: "Legenda sugerida para o post" },
    hashtags: { type: "array", items: { type: "string" }, description: "Hashtags sem o símbolo #" },
  },
  required: ["hook", "body", "cta", "caption", "hashtags"],
} as const;

async function callLovableAi(prompt: string): Promise<{ script: GeneratedScript; usage: TokenUsage }> {
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
      text: { format: { type: "json_schema", name: "roteiro", strict: true, schema } },
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
  const usage: TokenUsage = { input: 0, output: 0 };
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
          response?: {
            output_text?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        else if (event.type === "response.completed" && event.response?.output_text) text = event.response.output_text;
        const u = event.response?.usage;
        if (u) {
          if (typeof u.input_tokens === "number") usage.input = u.input_tokens;
          if (typeof u.output_tokens === "number") usage.output = u.output_tokens;
        }
      } catch {
        // ignore keep-alive / partial frames
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
  const result = parsed as Partial<GeneratedScript>;
  return {
    script: {
      hook: String(result.hook ?? ""),
      body: String(result.body ?? ""),
      cta: String(result.cta ?? ""),
      caption: String(result.caption ?? ""),
      hashtags: (Array.isArray(result.hashtags) ? result.hashtags : []).map((h) => String(h).replace(/^#/, "")).slice(0, 12),
    },
    usage,
  };
}

export const composeScript = (s: GeneratedScript) =>
  `GANCHO (0-3s)\n${s.hook}\n\nCORPO\n${s.body}\n\nCTA\n${s.cta}`;

/** Gera o roteiro de um job com a IA nativa do Lovable e avança o status uma etapa. */
export const generateJobScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, product_id, profile_id, status, title")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Job não encontrado ou sem permissão de acesso.");

    const { data: canEdit, error: permError } = await supabase.rpc("can_edit_pipeline", { _profile_id: job.profile_id });
    if (permError) throw new Error(permError.message);
    if (!canEdit) throw new Error("Você não tem permissão para gerar roteiro neste perfil.");

    const [{ data: product }, { data: identity }, { data: profile }] = await Promise.all([
      job.product_id
        ? supabase.from("products").select("name, price, commission, niche, sales_volume, url").eq("id", job.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("profile_identities").select("tone, language, style_notes").eq("profile_id", job.profile_id).maybeSingle(),
      supabase.from("profiles").select("name, niche").eq("id", job.profile_id).maybeSingle(),
    ]);

    const tone = TONE_LABELS[identity?.tone ?? "descontraido"] ?? (identity?.tone ?? "descontraído");
    const language = identity?.language || "pt-BR";
    const styleNotes = identity?.style_notes?.trim();

    const { resolvePrompt, renderPrompt } = await import("./prompts.server");
    const template = await resolvePrompt(supabase, job.profile_id, "roteiro");
    const prompt = renderPrompt(template, {
      idioma: language,
      tom_de_voz: tone,
      perfil: profile?.name ?? "",
      categoria: profile?.niche || "geral",
      produto: product?.name ?? job.title ?? "",
      preco: product ? Number(product.price).toFixed(2) : "",
      comissao: product ? `${Number(product.commission)}%` : "",
      categoria_produto: product?.niche || "",
      vendas: product?.sales_volume ?? "",
      titulo: job.title ?? "",
      observacoes_estilo: styleNotes ?? "",
    });

    const { script: generated, usage } = await callLovableAi(prompt);

    // Consumo de tokens do roteiro (inclusive regenerações).
    const { recordConsumo } = await import("./consumo.server");
    const modeloTexto = "gpt-6-astra";
    if (usage.input > 0) {
      await recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "roteiro_texto",
        modelo: modeloTexto,
        unidade: "token_input",
        quantidade: usage.input,
        metadados: { prompt_chars: prompt.length },
      });
    }
    if (usage.output > 0) {
      await recordConsumo({
        jobId: job.id,
        profileId: job.profile_id,
        etapa: "roteiro_texto",
        modelo: modeloTexto,
        unidade: "token_output",
        quantidade: usage.output,
        metadados: {},
      });
    }

    const nextStatus = job.status === "produto_escolhido" ? ("roteiro_pronto" as const) : job.status;

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        script: composeScript(generated),
        caption: generated.caption,
        hashtags: generated.hashtags,
        status: nextStatus,
      })
      .eq("id", job.id);
    if (updateError) throw new Error(updateError.message);

    return { ...generated, status: nextStatus };
  });
