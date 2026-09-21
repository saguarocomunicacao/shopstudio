/**
 * Log append-only de consumo real (imagens, segundos de vídeo, créditos de
 * montagem e buscas de produto). Nunca apaga nada: reinício de job não zera
 * o histórico, porque o que já foi gerado já foi cobrado pelo fornecedor.
 */

export type ConsumoEvento = {
  jobId?: string | null;
  /** Nulo em consumo global, como a atualização de categorias oficiais. */
  profileId: string | null;
  etapa:
    | "cena_gemini"
    | "animacao_veo"
    | "montagem_json2video"
    | "busca_kalodata"
    | "roteiro_texto"
    | "narracao_elevenlabs"
    | "transcricao_audio";
  modelo: string;
  quantidade: number | null;
  unidade:
    | "imagem"
    | "segundo_video"
    | "credito_montagem"
    | "bloco_linhas_kalodata"
    | "token_input"
    | "token_output"
    | "mil_caracteres"
    | "minuto_audio";
  metadados?: Record<string, unknown>;
};

/** Tenant da plataforma, usado apenas em consumo global (sem job e sem perfil). */
const PLATFORM_TENANT_ID = "f7192d96-160f-4157-8599-eced5990bf8b";

/** Grava um evento de consumo. Nunca derruba a geração se o log falhar. */
export async function recordConsumo(evento: ConsumoEvento): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // O insert roda com supabaseAdmin (sem sessão), então o tenant vem sempre da
    // entidade-pai: job -> perfil -> tenant da plataforma (consumo global).
    let tenantId: string | null = null;
    if (evento.jobId) {
      const { data } = await supabaseAdmin.from("jobs").select("tenant_id").eq("id", evento.jobId).maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }
    if (!tenantId && evento.profileId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("id", evento.profileId)
        .maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }
    if (!tenantId) tenantId = PLATFORM_TENANT_ID;

    const { error } = await supabaseAdmin.from("consumo_eventos").insert({
      tenant_id: tenantId,
      job_id: evento.jobId ?? null,
      profile_id: evento.profileId ?? null,
      etapa: evento.etapa as never,
      modelo: evento.modelo,
      quantidade: evento.quantidade,
      unidade: evento.unidade as never,
      metadados: (evento.metadados ?? {}) as never,
    });
    if (error) console.error("[consumo] falha ao registrar evento", error.message);
  } catch (e) {
    console.error("[consumo] falha ao registrar evento", e);
  }
}

/** Procura a quantidade de créditos em uma resposta do JSON2Video. */
export function findCredits(node: unknown, depth = 0): number | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCredits(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if ((k === "credits" || k.includes("credits_used") || k.includes("creditsused") || k.includes("credit_cost")) ) {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
      if (Number.isFinite(n)) return n;
    }
    const found = findCredits(value, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
