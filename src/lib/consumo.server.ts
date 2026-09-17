/**
 * Log append-only de consumo real (imagens, segundos de vídeo, créditos de
 * montagem e buscas de produto). Nunca apaga nada: reinício de job não zera
 * o histórico, porque o que já foi gerado já foi cobrado pelo fornecedor.
 */

export type ConsumoEvento = {
  jobId?: string | null;
  profileId: string;
  etapa: "cena_gemini" | "animacao_veo" | "montagem_json2video" | "busca_kalodata";
  modelo: string;
  quantidade: number | null;
  unidade: "imagem" | "segundo_video" | "credito_montagem" | "bloco_linhas_kalodata";
  metadados?: Record<string, unknown>;
};

/** Grava um evento de consumo. Nunca derruba a geração se o log falhar. */
export async function recordConsumo(evento: ConsumoEvento): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("consumo_eventos").insert({
      job_id: evento.jobId ?? null,
      profile_id: evento.profileId,
      etapa: evento.etapa,
      modelo: evento.modelo,
      quantidade: evento.quantidade,
      unidade: evento.unidade,
      metadados: evento.metadados ?? {},
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
