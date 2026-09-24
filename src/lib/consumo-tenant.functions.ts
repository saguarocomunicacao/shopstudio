/**
 * Visão de consumo do próprio cliente (tenant), sempre CONSOLIDADA:
 * preço da ferramenta (snapshot do evento) + custo de API estimado, somados.
 * As tarifas e a cotação ficam só no servidor — o cliente nunca recebe a
 * divisão entre ferramenta e API.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACAO_LABELS,
  acaoDoEvento,
  computeEventoCusto,
  precoFerramentaBrl,
  type BillableAction,
  type ConsumoEventoRow,
  type CreditoTaxaRow,
  type EtapaConsumo,
  type TarifaRow,
} from "./custo-core";

const SELECT =
  "id, job_id, profile_id, tenant_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, tool_price_cents, credito_consumido, credito_unidade, credito_origem";

async function carregarPrecos() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [tarifasRes, taxasRes, cotacaoRes] = await Promise.all([
    supabaseAdmin.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    supabaseAdmin
      .from("credito_taxas")
      .select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
    supabaseAdmin.from("app_config").select("value_num").eq("key", "cotacao_usd_brl").maybeSingle(),
  ]);
  const tarifas = ((tarifasRes.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    preco_unitario: Number(t["preco_unitario"]),
  })) as TarifaRow[];
  const taxas = ((taxasRes.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    credito_por_unidade: Number(t["credito_por_unidade"]),
  })) as unknown as CreditoTaxaRow[];
  return { tarifas, taxas, cotacao: Number(cotacaoRes.data?.value_num ?? 1) };
}

/** Soma consolidada de um evento: preço da ferramenta + custo de API estimado. */
function valorConsolidado(
  evento: ConsumoEventoRow,
  tarifas: TarifaRow[],
  cotacao: number,
  segundosDoJob: number,
  taxas: CreditoTaxaRow[] = [],
) {
  const custo = computeEventoCusto(evento, tarifas, cotacao, segundosDoJob, taxas);
  return {
    valorBrl: custo.valorBrl + precoFerramentaBrl(evento),
    unidades: custo.unidadesTarifadas,
    credito: custo.credito,
  };
}

function segundosPorJobDe(eventos: ConsumoEventoRow[]) {
  const mapa = new Map<string, number>();
  for (const e of eventos) {
    if (e.etapa !== "animacao_veo" || !e.job_id) continue;
    mapa.set(e.job_id, (mapa.get(e.job_id) ?? 0) + (e.quantidade ?? 0));
  }
  return mapa;
}

async function eventosDoTenant(
  supabase: { from: (t: string) => any },
  userId: string,
  filtros: { desde?: string; ate?: string },
) {
  const { data: me } = await supabase.from("app_users").select("tenant_id").eq("id", userId).maybeSingle();
  const tenantId = (me?.tenant_id ?? null) as string | null;
  if (!tenantId) return { tenantId: null, eventos: [] as ConsumoEventoRow[] };

  let query = supabase
    .from("consumo_eventos")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (filtros.desde) query = query.gte("created_at", filtros.desde);
  if (filtros.ate) query = query.lte("created_at", filtros.ate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { tenantId, eventos: (data ?? []) as ConsumoEventoRow[] };
}

export type ConsumoConsolidado = {
  totalBrl: number;
  eventos: number;
  porAcao: { acao: BillableAction; label: string; eventos: number; valorBrl: number; percentual: number }[];
  porDia: { dia: string; valorBrl: number }[];
  extrato: { id: string; created_at: string; acao: BillableAction; label: string; valorBrl: number }[];
};

/** Extrato consolidado do período para o cliente logado. */
export const consumoConsolidado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ desde: z.string().min(10), ate: z.string().min(10) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ConsumoConsolidado> =>
    montarConsumoConsolidado(context.supabase as never, context.userId, data),
  );

/** Mesma conta da tela Custos do cliente; reutilizada pelo assistente. */
export async function montarConsumoConsolidado(
  supabase: { from: (t: string) => any },
  userId: string,
  data: { desde: string; ate: string },
): Promise<ConsumoConsolidado> {
  {
    const { eventos } = await eventosDoTenant(supabase, userId, data);
    const { tarifas, taxas, cotacao } = await carregarPrecos();
    const segundos = segundosPorJobDe(eventos);

    const porAcao = new Map<BillableAction, { eventos: number; valorBrl: number }>();
    const porDia = new Map<string, number>();
    const extrato: ConsumoConsolidado["extrato"] = [];
    let totalBrl = 0;

    for (const evento of eventos) {
      const { valorBrl } = valorConsolidado(
        evento,
        tarifas,
        cotacao,
        evento.job_id ? segundos.get(evento.job_id) ?? 0 : 0,
        taxas,
      );
      const acao = acaoDoEvento(evento);
      totalBrl += valorBrl;
      const atual = porAcao.get(acao) ?? { eventos: 0, valorBrl: 0 };
      atual.eventos += 1;
      atual.valorBrl += valorBrl;
      porAcao.set(acao, atual);
      const dia = evento.created_at.slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + valorBrl);
      extrato.push({ id: evento.id, created_at: evento.created_at, acao, label: ACAO_LABELS[acao], valorBrl });
    }

    extrato.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return {
      totalBrl,
      eventos: eventos.length,
      porAcao: [...porAcao.entries()]
        .map(([acao, v]) => ({
          acao,
          label: ACAO_LABELS[acao],
          eventos: v.eventos,
          valorBrl: v.valorBrl,
          percentual: totalBrl > 0 ? (v.valorBrl / totalBrl) * 100 : 0,
        }))
        .sort((a, b) => b.valorBrl - a.valorBrl),
      porDia: [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, valorBrl]) => ({ dia, valorBrl })),
      extrato: extrato.slice(0, 300),
    };
  }
}

const FORNECEDOR_DE: Record<EtapaConsumo, "google" | "kalodata" | "json2video" | "elevenlabs"> = {
  cena_gemini: "google",
  animacao_veo: "google",
  roteiro_texto: "google",
  transcricao_audio: "google",
  busca_kalodata: "kalodata",
  montagem_json2video: "json2video",
  narracao_elevenlabs: "elevenlabs",
};

export type ConsumoFornecedor = {
  brl: number;
  unidades: number;
  mesBrl: number;
  cicloUnidades: number;
  /** Consumo na unidade nativa do fornecedor (pontos/créditos/mil caracteres). */
  credito: number;
  creditoUnidade: string | null;
};
export type ExtratoCredito = {
  id: string;
  created_at: string;
  fornecedor: "google" | "kalodata" | "json2video" | "elevenlabs";
  label: string;
  credito: number | null;
  unidade: string | null;
  origem: "real" | "estimado" | null;
  valorBrl: number;
};
export type ConsumoFornecedores = {
  totalBrl: number;
  fornecedores: Record<"google" | "kalodata" | "json2video" | "elevenlabs", ConsumoFornecedor>;
  extrato: ExtratoCredito[];
};

/** Consumo consolidado por fornecedor (desde sempre), usado na tela Investimento. */
export const consumoPorFornecedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        cicloInicio: z.string().nullable().optional(),
        cicloFim: z.string().nullable().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<ConsumoFornecedores> => {
    const { eventos } = await eventosDoTenant(context.supabase as never, context.userId, {});
    const { tarifas, taxas, cotacao } = await carregarPrecos();
    const segundos = segundosPorJobDe(eventos);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const cicloInicio = data.cicloInicio ? new Date(data.cicloInicio) : null;
    const cicloFim = data.cicloFim ? new Date(data.cicloFim) : null;

    const vazio = (): ConsumoFornecedor => ({
      brl: 0,
      unidades: 0,
      mesBrl: 0,
      cicloUnidades: 0,
      credito: 0,
      creditoUnidade: null,
    });
    const extrato: ExtratoCredito[] = [];
    const fornecedores: ConsumoFornecedores["fornecedores"] = {
      google: vazio(),
      kalodata: vazio(),
      json2video: vazio(),
      elevenlabs: vazio(),
    };
    let totalBrl = 0;

    for (const evento of eventos) {
      const { valorBrl, unidades, credito } = valorConsolidado(
        evento,
        tarifas,
        cotacao,
        evento.job_id ? segundos.get(evento.job_id) ?? 0 : 0,
        taxas,
      );
      const fornecedor = FORNECEDOR_DE[evento.etapa];
      const alvo = fornecedores[fornecedor];
      const quando = new Date(evento.created_at);
      alvo.brl += valorBrl;
      alvo.unidades += unidades;
      if (credito.credito !== null) {
        alvo.credito += credito.credito;
        alvo.creditoUnidade = credito.unidade;
      }
      const acaoEvento = acaoDoEvento(evento);
      extrato.push({
        id: evento.id,
        created_at: evento.created_at,
        fornecedor,
        label: ACAO_LABELS[acaoEvento],
        credito: credito.credito,
        unidade: credito.unidade,
        origem: credito.origem,
        valorBrl,
      });
      if (quando >= inicioMes) alvo.mesBrl += valorBrl;
      if (
        FORNECEDOR_DE[evento.etapa] === "json2video" &&
        cicloInicio &&
        cicloFim &&
        quando >= cicloInicio &&
        quando < cicloFim
      ) {
        alvo.cicloUnidades += unidades;
      }
      totalBrl += valorBrl;
    }

    extrato.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { totalBrl, fornecedores, extrato: extrato.slice(0, 200) };
  });
