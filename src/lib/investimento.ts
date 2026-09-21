/**
 * Investimento / saldo dos fornecedores, por cliente (tenant).
 * Cruza os aportes lançados manualmente (carteira pré-paga) e o plano de
 * assinatura com o consumo já gravado em consumo_eventos.
 *
 * Backoffice vê o consumo discriminado (custo de API calculado das tarifas);
 * o cliente recebe do servidor o valor já consolidado (ferramenta + API).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  ACAO_LABELS,
  acaoDoEvento,
  computeEventoCusto,
  precoFerramentaBrl,
  useTarifas,
  type ConsumoEventoRow,
  type EtapaConsumo,
} from "./custo";
import { consumoPorFornecedor, type ExtratoCredito } from "./consumo-tenant.functions";
import { useAppConfig } from "./orcamento";

export type FornecedorKey = "google" | "kalodata" | "json2video" | "elevenlabs";
export type TipoCarteira = "prepaga" | "assinatura";

export const CONFIG_INVESTIMENTO = {
  alertaPercent: "investimento_alerta_percent",
  bloqueio: "investimento_bloqueio_saldo",
} as const;

export const ALERTA_PADRAO = 20;

type FornecedorDef = {
  key: FornecedorKey;
  nome: string;
  tipo: TipoCarteira;
  descricao: string;
  etapas: EtapaConsumo[];
  /** Unidade própria do fornecedor (quando faz sentido controlar em unidade). */
  unidade: string | null;
  unidadeLabel: (q: number) => string;
};

export const FORNECEDORES: FornecedorDef[] = [
  {
    key: "google",
    nome: "Google (Gemini + Veo)",
    tipo: "prepaga",
    descricao: "Roteiro, imagens das cenas e animação. Aporte em reais, consumo em dólar convertido pela cotação.",
    etapas: ["roteiro_texto", "cena_gemini", "animacao_veo"],
    unidade: null,
    unidadeLabel: () => "",
  },
  {
    key: "kalodata",
    nome: "Kalodata",
    tipo: "prepaga",
    descricao: "Buscas de produto e atualização de categorias. Controle em pontos.",
    etapas: ["busca_kalodata"],
    unidade: "pontos",
    unidadeLabel: (q) => `${Number(q.toFixed(2))} pontos`,
  },
  {
    key: "json2video",
    nome: "JSON2Video",
    tipo: "assinatura",
    descricao: "Montagem final do vídeo. Cota mensal de créditos que renova a cada ciclo.",
    etapas: ["montagem_json2video"],
    unidade: "créditos",
    unidadeLabel: (q) => `${Number(q.toFixed(2))} ${q === 1 ? "crédito" : "créditos"}`,
  },
  {
    key: "elevenlabs",
    nome: "ElevenLabs",
    tipo: "assinatura",
    descricao: "Narração das vozes clonadas e do catálogo. Assinatura mensal com cota de caracteres.",
    etapas: ["narracao_elevenlabs"],
    unidade: "mil caracteres",
    unidadeLabel: (q) => `${Number(q.toFixed(2))} mil caracteres`,
  },
];

export const fornecedorDe = (etapa: EtapaConsumo): FornecedorKey =>
  etapa === "busca_kalodata"
    ? "kalodata"
    : etapa === "montagem_json2video"
      ? "json2video"
      : etapa === "narracao_elevenlabs"
        ? "elevenlabs"
        : "google";

export const fornecedorInfo = (key: FornecedorKey) => FORNECEDORES.find((f) => f.key === key)!;

export type AporteRow = {
  id: string;
  fornecedor: FornecedorKey;
  data: string;
  valor_brl: number;
  unidades: number | null;
  unidade: string | null;
  observacao: string | null;
  created_at: string;
};

export type PlanoRow = {
  fornecedor: FornecedorKey;
  creditos_mes: number;
  valor_mensal: number;
  dia_renovacao: number;
  ativo: boolean;
};

export type CarteiraFornecedor = {
  def: FornecedorDef;
  /** Total aportado em reais (todas as recargas/mensalidades lançadas). */
  aportadoBrl: number;
  /** Unidades que entraram pelos aportes (pontos/créditos), quando informadas. */
  aportadoUnidades: number;
  /** Consumo acumulado (desde sempre) em reais e na unidade do fornecedor. */
  consumoBrl: number;
  consumoUnidades: number;
  /** Consumo na unidade nativa do fornecedor (pontos, créditos, mil caracteres). */
  consumoCredito: number;
  creditoUnidade: string | null;
  /** Extrato de desconto por evento, na unidade nativa. */
  extratoCredito: ExtratoCredito[];
  /** Consumo do mês corrente, em reais. */
  consumoMesBrl: number;
  saldoBrl: number | null;
  saldoUnidades: number | null;
  /** Fração restante (0 a 1) usada no alerta; null quando não dá para medir. */
  restante: number | null;
  baixo: boolean;
  plano: PlanoRow | null;
  ciclo: { inicio: Date; fim: Date; usados: number; cota: number } | null;
  aportes: AporteRow[];
};

export type VisaoInvestimento = {
  carteiras: CarteiraFornecedor[];
  totalInvestidoBrl: number;
  totalConsumidoBrl: number;
  alertaPercent: number;
  bloqueio: boolean;
};

/** Início do ciclo atual da assinatura, a partir do dia de renovação. */
export function cicloAtual(diaRenovacao: number, agora = new Date()) {
  const dia = Math.min(Math.max(diaRenovacao || 1, 1), 28);
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), dia);
  if (agora < inicio) inicio.setMonth(inicio.getMonth() - 1);
  const fim = new Date(inicio);
  fim.setMonth(fim.getMonth() + 1);
  return { inicio, fim };
}

export function useAportes(tenantId: string | null) {
  return useQuery({
    queryKey: ["fornecedor-aportes", tenantId ?? "todos"],
    queryFn: async () => {
      let query = supabase
        .from("fornecedor_aportes")
        .select("id, fornecedor, data, valor_brl, unidades, unidade, observacao, created_at")
        .order("data", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((a) => ({
        ...a,
        valor_brl: Number(a.valor_brl),
        unidades: a.unidades === null ? null : Number(a.unidades),
      })) as AporteRow[];
    },
  });
}

export function usePlanos(tenantId: string | null) {
  return useQuery({
    queryKey: ["fornecedor-planos", tenantId ?? "todos"],
    queryFn: async () => {
      let query = supabase
        .from("fornecedor_planos")
        .select("fornecedor, creditos_mes, valor_mensal, dia_renovacao, ativo");
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        ...p,
        creditos_mes: Number(p.creditos_mes),
        valor_mensal: Number(p.valor_mensal),
      })) as PlanoRow[];
    },
  });
}

function useEventosConsumo(tenantId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["investimento-consumo", tenantId ?? "todos"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("consumo_eventos")
        .select(
          "id, job_id, profile_id, tenant_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, tool_price_cents, credito_consumido, credito_unidade, credito_origem",
        )
        .order("created_at", { ascending: true });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConsumoEventoRow[];
    },
  });
}

type UsoFornecedor = {
  brl: number;
  unidades: number;
  mesBrl: number;
  cicloUnidades: number;
  credito: number;
  creditoUnidade: string | null;
};

/**
 * Visão completa: aportes × consumo por fornecedor, com alertas de saldo baixo.
 * modo "api" = backoffice (custo de API das tarifas);
 * modo "consolidado" = cliente (valor único vindo do servidor).
 */
export function useInvestimento(
  tenantId: string | null,
  modo: "api" | "consolidado" = "api",
): { data: VisaoInvestimento | null; isLoading: boolean } {
  const backoffice = modo === "api";
  const { data: precos, isLoading: l1 } = useTarifas();
  const { data: aportes, isLoading: l2 } = useAportes(tenantId);
  const { data: planos, isLoading: l3 } = usePlanos(tenantId);
  const { data: eventos, isLoading: l4 } = useEventosConsumo(tenantId, backoffice);
  const { data: config } = useAppConfig();

  const planoJson = planos?.find((p) => p.fornecedor === "json2video") ?? null;
  const ciclo = planoJson ? cicloAtual(planoJson.dia_renovacao) : null;

  const buscarConsumo = useServerFn(consumoPorFornecedor);
  const { data: consumoServidor, isLoading: l5 } = useQuery({
    queryKey: ["investimento-consumo-servidor", ciclo?.inicio.toISOString() ?? null],
    enabled: !backoffice && !!planos,
    refetchInterval: 60_000,
    queryFn: () =>
      buscarConsumo({
        data: {
          cicloInicio: ciclo ? ciclo.inicio.toISOString() : null,
          cicloFim: ciclo ? ciclo.fim.toISOString() : null,
        },
      }),
  });

  const isLoading = backoffice ? l1 || l2 || l3 || l4 : l2 || l3 || l5;
  const consumoPronto = backoffice ? !!precos && !!eventos : !!consumoServidor;
  if (!aportes || !planos || !consumoPronto) return { data: null, isLoading };

  const alertaRaw = Number(config?.get(CONFIG_INVESTIMENTO.alertaPercent)?.value_num ?? ALERTA_PADRAO);
  const alertaPercent = Number.isFinite(alertaRaw) && alertaRaw > 0 ? alertaRaw : ALERTA_PADRAO;
  const bloqueio = Number(config?.get(CONFIG_INVESTIMENTO.bloqueio)?.value_num ?? 0) === 1;

  const acc = new Map<FornecedorKey, UsoFornecedor>();
  for (const f of FORNECEDORES)
    acc.set(f.key, { brl: 0, unidades: 0, mesBrl: 0, cicloUnidades: 0, credito: 0, creditoUnidade: null });
  const extratos = new Map<FornecedorKey, ExtratoCredito[]>();
  for (const f of FORNECEDORES) extratos.set(f.key, []);
  let totalConsumidoBrl = 0;

  if (backoffice) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const segundosPorJob = new Map<string, number>();
    for (const e of eventos!) {
      if (e.etapa !== "animacao_veo" || !e.job_id) continue;
      segundosPorJob.set(e.job_id, (segundosPorJob.get(e.job_id) ?? 0) + (e.quantidade ?? 0));
    }

    for (const evento of eventos!) {
      const custo = computeEventoCusto(
        evento,
        precos!.tarifas,
        precos!.cotacao,
        evento.job_id ? segundosPorJob.get(evento.job_id) ?? 0 : 0,
        precos!.taxas,
      );
      const key = fornecedorDe(evento.etapa);
      const alvo = acc.get(key)!;
      const quando = new Date(evento.created_at);
      alvo.brl += custo.valorBrl;
      alvo.unidades += custo.unidadesTarifadas;
      if (custo.credito.credito !== null) {
        alvo.credito += custo.credito.credito;
        alvo.creditoUnidade = custo.credito.unidade;
      }
      extratos.get(key)!.push({
        id: evento.id,
        created_at: evento.created_at,
        fornecedor: key,
        label: ACAO_LABELS[acaoDoEvento(evento)],
        credito: custo.credito.credito,
        unidade: custo.credito.unidade,
        origem: custo.credito.origem,
        valorBrl: custo.valorBrl,
      });
      if (quando >= inicioMes) alvo.mesBrl += custo.valorBrl;
      if (key === "json2video" && ciclo && quando >= ciclo.inicio && quando < ciclo.fim) {
        alvo.cicloUnidades += custo.unidadesTarifadas;
      }
      totalConsumidoBrl += custo.valorBrl;
    }
  } else {
    for (const f of FORNECEDORES) acc.set(f.key, { ...consumoServidor!.fornecedores[f.key] });
    for (const linha of consumoServidor!.extrato) extratos.get(linha.fornecedor)?.push(linha);
    totalConsumidoBrl = consumoServidor!.totalBrl;
  }

  const carteiras = FORNECEDORES.map<CarteiraFornecedor>((def) => {
    const uso = acc.get(def.key)!;
    const meus = aportes.filter((a) => a.fornecedor === def.key);
    const aportadoBrl = meus.reduce((s, a) => s + a.valor_brl, 0);
    const aportadoUnidades = meus.reduce((s, a) => s + (a.unidades ?? 0), 0);
    const plano = planos.find((p) => p.fornecedor === def.key) ?? null;
    const extrato = [...(extratos.get(def.key) ?? [])]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 30);

    if (def.tipo === "assinatura") {
      const cota = plano?.creditos_mes ?? 0;
      const usados = uso.cicloUnidades;
      const restante = cota > 0 ? Math.max(0, cota - usados) / cota : null;
      return {
        def,
        aportadoBrl,
        aportadoUnidades,
        consumoBrl: uso.brl,
        consumoUnidades: uso.unidades,
        consumoCredito: uso.credito,
        creditoUnidade: uso.creditoUnidade ?? def.unidade,
        extratoCredito: extrato,
        consumoMesBrl: uso.mesBrl,
        saldoBrl: null,
        saldoUnidades: cota > 0 ? cota - usados : null,
        restante,
        baixo: restante !== null && restante * 100 < alertaPercent,
        plano,
        ciclo: ciclo ? { ...ciclo, usados, cota } : null,
        aportes: meus,
      };
    }

    const saldoBrl = aportadoBrl - uso.brl;
    const saldoUnidades = aportadoUnidades > 0 ? aportadoUnidades - uso.unidades : null;
    const restantePorUnidade = aportadoUnidades > 0 ? Math.max(0, saldoUnidades!) / aportadoUnidades : null;
    const restantePorValor = aportadoBrl > 0 ? Math.max(0, saldoBrl) / aportadoBrl : null;
    const restante = def.unidade && restantePorUnidade !== null ? restantePorUnidade : restantePorValor;
    return {
      def,
      aportadoBrl,
      aportadoUnidades,
      consumoBrl: uso.brl,
      consumoUnidades: uso.unidades,
      consumoCredito: uso.credito,
      creditoUnidade: uso.creditoUnidade ?? def.unidade,
      extratoCredito: extrato,
      consumoMesBrl: uso.mesBrl,
      saldoBrl,
      saldoUnidades,
      restante,
      baixo: restante !== null && restante * 100 < alertaPercent,
      plano,
      ciclo: null,
      aportes: meus,
    };
  });

  return {
    data: {
      carteiras,
      totalInvestidoBrl: aportes.reduce((s, a) => s + a.valor_brl, 0),
      totalConsumidoBrl,
      alertaPercent,
      bloqueio,
    },
    isLoading: false,
  };
}

/** Fornecedores com saldo/cota abaixo do limite configurado (visão interna). */
export function useSaldosBaixos() {
  const { data } = useInvestimento(null, "api");
  return data ? data.carteiras.filter((c) => c.baixo) : [];
}

export function useSalvarAporte(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fornecedor: FornecedorKey;
      data: string;
      valor_brl: number;
      unidades: number | null;
      observacao: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const def = fornecedorInfo(input.fornecedor);
      const linha: Record<string, unknown> = {
        fornecedor: input.fornecedor,
        data: input.data,
        valor_brl: input.valor_brl,
        unidades: input.unidades,
        unidade: def.unidade,
        observacao: input.observacao,
        created_by: userData.user?.id ?? null,
      };
      if (tenantId) linha["tenant_id"] = tenantId;
      const { error } = await supabase.from("fornecedor_aportes").insert(linha as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fornecedor-aportes"] }),
  });
}

export function useRemoverAporte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedor_aportes").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fornecedor-aportes"] }),
  });
}

export function useSalvarPlano(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlanoRow) => {
      const linha: Record<string, unknown> = {
        fornecedor: input.fornecedor,
        creditos_mes: input.creditos_mes,
        valor_mensal: input.valor_mensal,
        dia_renovacao: input.dia_renovacao,
        ativo: input.ativo,
      };
      if (tenantId) linha["tenant_id"] = tenantId;
      const { error } = await supabase
        .from("fornecedor_planos")
        .upsert(linha as never, { onConflict: "tenant_id,fornecedor" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fornecedor-planos"] }),
  });
}

export { precoFerramentaBrl };
