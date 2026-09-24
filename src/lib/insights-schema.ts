import { z } from "zod";

/** Insights estruturados (versão 2). Compartilhado entre servidor (validação) e tela (render). */
export const PADRAO_CHAVES = ["gancho", "formato", "duracao", "ritmo", "produto_2s"] as const;
export const PADRAO_LABEL: Record<(typeof PADRAO_CHAVES)[number], string> = {
  gancho: "Gancho", formato: "Formato", duracao: "Duração", ritmo: "Ritmo", produto_2s: "Produto nos 2s",
};

export const insightsSchema = z.object({
  resumo: z.array(z.string().min(3)).min(1).max(5),
  padroes: z.array(z.object({
    chave: z.enum(PADRAO_CHAVES),
    achado: z.string().min(3),
    posicao: z.enum(["acima", "abaixo", "neutro"]),
  })).min(1).max(8),
  ganchos: z.array(z.object({ video_id: z.string().min(3), gancho: z.string().min(1), por_que: z.string().optional().default("") })).max(10),
  recomendacoes: z.array(z.object({ titulo: z.string().min(2), explicacao: z.string().min(2) })).min(1).max(8),
  comparativo: z.array(z.object({ aspecto: z.string().min(1), melhores: z.string().min(1), piores: z.string().min(1) })).max(10),
});
export type InsightsV2 = z.infer<typeof insightsSchema> & { versao: 2; n_videos: number };

/** Schema no formato do Gemini (responseSchema). */
export const insightsGeminiSchema = {
  type: "OBJECT",
  properties: {
    resumo: { type: "ARRAY", items: { type: "STRING" }, description: "Exatamente 3 frases." },
    padroes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          chave: { type: "STRING", enum: [...PADRAO_CHAVES] },
          achado: { type: "STRING" },
          posicao: { type: "STRING", enum: ["acima", "abaixo", "neutro"] },
        },
        required: ["chave", "achado", "posicao"],
      },
    },
    ganchos: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { video_id: { type: "STRING" }, gancho: { type: "STRING" }, por_que: { type: "STRING" } }, required: ["video_id", "gancho"] },
    },
    recomendacoes: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { titulo: { type: "STRING" }, explicacao: { type: "STRING" } }, required: ["titulo", "explicacao"] },
    },
    comparativo: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { aspecto: { type: "STRING" }, melhores: { type: "STRING" }, piores: { type: "STRING" } }, required: ["aspecto", "melhores", "piores"] },
    },
  },
  required: ["resumo", "padroes", "ganchos", "recomendacoes", "comparativo"],
} as const;

/** Lê o campo insights: JSON v2 ou texto antigo. */
export function lerInsights(texto: string | null | undefined): { v2: InsightsV2 } | { texto: string } | null {
  if (!texto) return null;
  const t = texto.trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as InsightsV2;
      if (j && j.versao === 2) return { v2: j };
    } catch { /* texto antigo */ }
  }
  return { texto: t };
}

/** Sem travessão nos textos gerados. */
export const semTravessao = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");

export function recomendacoesComoTexto(v: InsightsV2, handle: string) {
  return [`Recomendações a partir de @${handle}:`, ...v.recomendacoes.map((r, i) => `${i + 1}. ${r.titulo}: ${r.explicacao}`)].join("\n");
}
