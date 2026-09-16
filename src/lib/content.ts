import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DbProduct = {
  id: string;
  name: string;
  niche: string;
  price: number;
  commission: number;
  url: string;
  hype: number;
  status: string;
  created_by: string | null;
  image_url: string;
  seller_name: string;
  sales_volume: number;
  growth_rate: number;
  revenue: number;
  origin: string;
  source: string | null;
  external_id: string | null;
  category_id: string | null;
};

export type DbCategory = { category_id: string; category_name: string; level: number; parent_id: string | null };

/** Categorias oficiais do TikTok Shop (nível 1), sincronizadas do Kalodata. */
export function useCategories(enabled = true) {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("category_id, category_name, level, parent_id")
        .eq("level", 1)
        .order("category_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as DbCategory[];
    },
    enabled,
  });
}

export const JOB_STATUSES = [
  "novo",
  "produto_escolhido",
  "roteiro_pronto",
  "cenas_geradas",
  "gerando_video",
  "video_pronto",
  "rascunho_enviado",
  "publicado",
] as const;
export type JobStatusKey = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatusKey, string> = {
  novo: "Novo",
  produto_escolhido: "Produto escolhido",
  roteiro_pronto: "Roteiro pronto",
  cenas_geradas: "Cenas geradas",
  gerando_video: "Gerando vídeo",
  video_pronto: "Vídeo pronto",
  rascunho_enviado: "Rascunho enviado",
  publicado: "Publicado",
};


/** Transição guiada para trás: recua uma etapa por vez, preservando o conteúdo já gerado. */
export const PREVIOUS_STATUS: Partial<Record<JobStatusKey, JobStatusKey>> = {
  publicado: "rascunho_enviado",
  rascunho_enviado: "video_pronto",
  video_pronto: "cenas_geradas",
  cenas_geradas: "roteiro_pronto",
  roteiro_pronto: "produto_escolhido",
};

export type DbJob = {
  id: string;
  product_id: string | null;
  profile_id: string;
  status: JobStatusKey;
  title: string;
  created_at: string;
  script: string | null;
  caption: string | null;
  hashtags: string[] | null;
  video_url: string | null;
  video_thumbnail_url: string | null;
  render_id: string | null;
  render_error: string | null;
  render_started_at: string | null;
  render_stage: string | null;
  scenes: VideoScene[] | null;
  gemini_images_count: number;
  veo_takes_count: number;
};

export type VideoScene = {
  narration: string;
  image_prompt: string;
  motion_prompt: string;
  overlay_text: string;
  image_url?: string;
  video_url?: string;
  operation?: string;
};

export type DbVideoSettings = {
  profile_id: string;
  avatar_mode: "fixo" | "livre";
  avatar_reference_url: string | null;
  takes_count: number;
  gemini_model: string;
  veo_model: string;
  take_duration: number;
};

export function useVideoSettings(profileId: string | null) {
  return useQuery({
    queryKey: ["video-settings", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_video_settings")
        .select("profile_id, avatar_mode, avatar_reference_url, takes_count, gemini_model, veo_model, take_duration")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as DbVideoSettings | null;
    },
    enabled: !!profileId && profileId !== "all",
  });
}

export type ProfileIdentity = { profile_id: string; tone: string; language: string; style_notes: string };

export const TONE_OPTIONS = [
  { value: "descontraido", label: "Descontraído" },
  { value: "informativo", label: "Informativo" },
  { value: "entusiasmado", label: "Entusiasmado" },
  { value: "elegante", label: "Elegante" },
  { value: "engracado", label: "Bem-humorado" },
];

export const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { value: "en-US", label: "Inglês", flag: "🇺🇸" },
  { value: "es-ES", label: "Espanhol", flag: "🇪🇸" },
  { value: "id-ID", label: "Indonésio", flag: "🇮🇩" },
  { value: "ms-MY", label: "Malaio", flag: "🇲🇾" },
  { value: "th-TH", label: "Tailandês", flag: "🇹🇭" },
  { value: "vi-VN", label: "Vietnamita", flag: "🇻🇳" },
  { value: "ja-JP", label: "Japonês", flag: "🇯🇵" },
  { value: "ko-KR", label: "Coreano", flag: "🇰🇷" },
  { value: "de-DE", label: "Alemão", flag: "🇩🇪" },
  { value: "fr-FR", label: "Francês", flag: "🇫🇷" },
  { value: "it-IT", label: "Italiano", flag: "🇮🇹" },
  { value: "ru-RU", label: "Russo", flag: "🇷🇺" },
  { value: "ar-SA", label: "Árabe", flag: "🇸🇦" },
];

export const languageLabel = (value: string) => {
  const lang = LANGUAGE_OPTIONS.find((l) => l.value === value);
  return lang ? `${lang.flag} ${lang.label}` : value;
};

export function useProfileIdentity(profileId: string | null) {
  return useQuery({
    queryKey: ["profile-identity", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_identities")
        .select("profile_id, tone, language, style_notes")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ProfileIdentity | null;
    },
    enabled: !!profileId && profileId !== "all",
  });
}

export function useProducts(enabled = true) {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("hype", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        ...p,
        price: Number(p.price),
        commission: Number(p.commission),
      })) as DbProduct[];
    },
    enabled,
  });
}

export function useJobs(enabled = true) {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, product_id, profile_id, status, title, created_at, script, caption, hashtags, video_url, video_thumbnail_url, render_id, render_error, render_started_at, render_stage, scenes, gemini_images_count, veo_takes_count",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DbJob[];
    },
    enabled,
    // Enquanto houver etapa em andamento (cenas ou vídeo), reconsulta para o card avançar sozinho.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j: DbJob) => j.status === "gerando_video" || !!j.render_stage) ? 6000 : false,
  });
}


export const formatPrice = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
};
