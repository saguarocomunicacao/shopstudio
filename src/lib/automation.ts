/**
 * Automação (Parte 1): apenas configuração das agendas de geração por IA.
 * Nada aqui dispara geração — a execução é da Parte 2.
 *
 * Regra de escolha de produto (documentada no schema, aplicada na Parte 2):
 * a automação pega o próximo produto que atende aos filtros e que ainda NÃO
 * tem vídeo criado para aquele perfil (cruzamento com jobs.product_id).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeJobCusto, useTarifas, type ConsumoEventoRow } from "./custo";

export type AutomationFonte = "garimpo" | "radar";
export type AutomationAvatarModo = "perfil" | "biblioteca" | "nenhum";

export type AutomationFiltros = {
  comissao_min?: number | null;
  preco_min?: number | null;
  preco_max?: number | null;
  receita_min?: number | null;
  lancamento?: "<3" | "<7" | "<30" | ">30" | null;
  periodo?: "lastDay" | "last7Day" | "last30Day" | null;
  palavra_chave?: string | null;
};

export type AutomationSchedule = {
  id: string;
  profile_id: string;
  nome: string;
  ativa: boolean;
  videos_por_dia: number;
  horarios: string[];
  fonte: AutomationFonte;
  filtros: AutomationFiltros;
  avatar_modo: AutomationAvatarModo;
  avatar_id: string | null;
  voice_ref: string | null;
  cenas_count: number | null;
  take_duration: number | null;
  qualidade: string | null;
  teto_diario_cents: number | null;
  teto_mensal_cents: number | null;
  pausada_motivo: string | null;
  ultimo_disparo_em: string | null;
  created_at: string;
};

export const FONTE_LABELS: Record<AutomationFonte, string> = {
  garimpo: "Garimpo normal (produtos em alta da categoria)",
  radar: "Radar de emergentes (produtos começando a subir)",
};

export const AVATAR_MODO_LABELS: Record<AutomationAvatarModo, string> = {
  perfil: "Usar o avatar do perfil",
  biblioteca: "Escolher da biblioteca do perfil",
  nenhum: "Sem pessoa nas cenas",
};

export const PERIODO_LABELS: Record<string, string> = {
  lastDay: "Último dia",
  last7Day: "Últimos 7 dias",
  last30Day: "Últimos 30 dias",
};

export const LANCAMENTO_LABELS: Record<string, string> = {
  "<3": "Lançados há menos de 3 dias",
  "<7": "Lançados há menos de 7 dias",
  "<30": "Lançados há menos de 30 dias",
  ">30": "Lançados há mais de 30 dias",
};

const SELECT =
  "id, profile_id, nome, ativa, videos_por_dia, horarios, fonte, filtros, avatar_modo, avatar_id, voice_ref, cenas_count, take_duration, qualidade, teto_diario_cents, teto_mensal_cents, pausada_motivo, ultimo_disparo_em, created_at";

const toRow = (row: Record<string, unknown>): AutomationSchedule => ({
  ...(row as unknown as AutomationSchedule),
  horarios: Array.isArray(row["horarios"]) ? (row["horarios"] as unknown[]).map(String) : [],
  filtros: (row["filtros"] ?? {}) as AutomationFiltros,
});

export function useAutomationSchedules(profileId: string | null) {
  return useQuery({
    queryKey: ["automation-schedules", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_schedules")
        .select(SELECT)
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
    },
  });
}

export type AutomationRun = {
  id: string;
  schedule_id: string;
  job_id: string | null;
  dia: string;
  horario: string;
  status: string;
  mensagem: string | null;
  created_at: string;
};

export type AutomationJobInsight = {
  id: string;
  scheduleId: string;
  title: string;
  productName: string | null;
  status: string;
  createdAt: string;
  costBrl: number;
};

export type AutomationScheduleInsight = {
  scheduleId: string;
  costTodayBrl: number;
  costMonthBrl: number;
  costTotalBrl: number;
  videosToday: number;
  videosMonth: number;
  videosTotal: number;
  latestRunStatus: string | null;
  latestRunMessage: string | null;
};

export type AutomationInsights = {
  jobs: Map<string, AutomationJobInsight>;
  schedules: Map<string, AutomationScheduleInsight>;
  totalTodayBrl: number;
  totalMonthBrl: number;
  totalBrl: number;
};

/** Últimas execuções das agendas do perfil (registro simples do cron). */
export function useAutomationRuns(profileId: string | null) {
  return useQuery({
    queryKey: ["automation-runs", profileId],
    enabled: !!profileId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select("id, schedule_id, job_id, dia, horario, status, mensagem, created_at")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as AutomationRun[];
    },
  });
}

const brasiliaDateKey = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);

/** Recorte dos mesmos eventos exibidos em Custos, limitado aos jobs da automação do perfil. */
export function useAutomationInsights(profileId: string | null, runs: AutomationRun[]) {
  const { data: prices } = useTarifas();
  return useQuery({
    queryKey: ["automation-insights", profileId, prices?.cotacao, runs.map((r) => `${r.id}:${r.status}`).join(",")],
    enabled: !!profileId && !!prices,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AutomationInsights> => {
      if (!profileId || !prices) {
        return { jobs: new Map(), schedules: new Map(), totalTodayBrl: 0, totalMonthBrl: 0, totalBrl: 0 };
      }
      const { data: jobsData, error: jobsError } = await supabase
        .from("jobs")
        .select("id, automation_schedule_id, title, product_id, status, created_at")
        .eq("profile_id", profileId)
        .not("automation_schedule_id", "is", null);
      if (jobsError) throw new Error(jobsError.message);

      const rawJobs = (jobsData ?? []) as Array<{
        id: string;
        automation_schedule_id: string | null;
        title: string;
        product_id: string | null;
        status: string;
        created_at: string;
      }>;
      const jobIds = rawJobs.map((job) => job.id);
      const productIds = [...new Set(rawJobs.map((job) => job.product_id).filter((id): id is string => !!id))];
      const [eventsResult, productsResult] = await Promise.all([
        jobIds.length
          ? supabase
              .from("consumo_eventos")
              .select("id, job_id, profile_id, etapa, modelo, quantidade, unidade, metadados, created_at, action_type, credito_consumido, credito_unidade, credito_origem")
              .in("job_id", jobIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        productIds.length
          ? supabase.from("products").select("id, name").in("id", productIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (eventsResult.error) throw new Error(eventsResult.error.message);
      if (productsResult.error) throw new Error(productsResult.error.message);

      const productNames = new Map((productsResult.data ?? []).map((product) => [product.id, product.name]));
      const eventsByJob = new Map<string, ConsumoEventoRow[]>();
      for (const event of (eventsResult.data ?? []) as unknown as ConsumoEventoRow[]) {
        if (!event.job_id) continue;
        const list = eventsByJob.get(event.job_id) ?? [];
        list.push(event);
        eventsByJob.set(event.job_id, list);
      }

      const today = brasiliaDateKey(new Date());
      const month = today.slice(0, 7);
      const jobs = new Map<string, AutomationJobInsight>();
      const schedules = new Map<string, AutomationScheduleInsight>();
      let totalTodayBrl = 0;
      let totalMonthBrl = 0;
      let totalBrl = 0;

      for (const job of rawJobs) {
        if (!job.automation_schedule_id) continue;
        const cost = computeJobCusto(eventsByJob.get(job.id) ?? [], prices.tarifas, prices.cotacao, prices.taxas).totalBrl;
        const dateKey = brasiliaDateKey(job.created_at);
        const isToday = dateKey === today;
        const isMonth = dateKey.slice(0, 7) === month;
        jobs.set(job.id, {
          id: job.id,
          scheduleId: job.automation_schedule_id,
          title: job.title,
          productName: job.product_id ? productNames.get(job.product_id) ?? null : null,
          status: job.status,
          createdAt: job.created_at,
          costBrl: cost,
        });
        const current = schedules.get(job.automation_schedule_id) ?? {
          scheduleId: job.automation_schedule_id,
          costTodayBrl: 0,
          costMonthBrl: 0,
          costTotalBrl: 0,
          videosToday: 0,
          videosMonth: 0,
          videosTotal: 0,
          latestRunStatus: null,
          latestRunMessage: null,
        };
        current.costTotalBrl += cost;
        current.videosTotal += 1;
        if (isMonth) {
          current.costMonthBrl += cost;
          current.videosMonth += 1;
        }
        if (isToday) {
          current.costTodayBrl += cost;
          current.videosToday += 1;
        }
        schedules.set(job.automation_schedule_id, current);
        totalBrl += cost;
        if (isMonth) totalMonthBrl += cost;
        if (isToday) totalTodayBrl += cost;
      }

      for (const run of runs) {
        const current = schedules.get(run.schedule_id) ?? {
          scheduleId: run.schedule_id,
          costTodayBrl: 0,
          costMonthBrl: 0,
          costTotalBrl: 0,
          videosToday: 0,
          videosMonth: 0,
          videosTotal: 0,
          latestRunStatus: null,
          latestRunMessage: null,
        };
        if (current.latestRunStatus === null) {
          current.latestRunStatus = run.status;
          current.latestRunMessage = run.mensagem;
        }
        schedules.set(run.schedule_id, current);
      }

      return { jobs, schedules, totalTodayBrl, totalMonthBrl, totalBrl };
    },
  });
}



export type AutomationInput = Omit<AutomationSchedule, "id" | "created_at" | "pausada_motivo" | "ultimo_disparo_em"> & {
  id?: string | undefined;
};

export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AutomationInput) => {
      const { id, ...payload } = input;
      const body = {
        ...payload,
        filtros: payload.filtros as unknown as Record<string, never>,
        horarios: payload.horarios as unknown as Record<string, never>,
      };
      const query = id
        ? supabase.from("automation_schedules").update(body).eq("id", id).select(SELECT).single()
        : supabase.from("automation_schedules").insert(body).select(SELECT).single();
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return toRow(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-schedules"] }),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase
        .from("automation_schedules")
        .update({ ativa, pausada_motivo: null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_schedules").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-schedules"] }),
  });
}
