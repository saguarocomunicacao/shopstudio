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
