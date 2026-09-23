import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RecordingAspectRatio } from "@/lib/recording-format";
import type { VisualStyle } from "@/lib/visual-style";

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
  description: string | null;
  description_origem?: string | null;
  extra_image_urls: string[] | null;
  updated_at?: string | null;
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
  "gerando_cenas",
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
  gerando_cenas: "Gerando cenas",
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
  gerando_cenas: "roteiro_pronto",
  roteiro_pronto: "produto_escolhido",
};

/** Rótulo da etapa visível, detalhando a geração por IA quando ela está ativa. */
export function jobStatusLabel(job: Pick<DbJob, "status" | "ai_render_stage">): string {
  if (job.status === "gerando_cenas") return "Gerando cenas";
  if (job.status === "gerando_video") {
    if (job.ai_render_stage === "takes") return "Animando vídeo";
    if (job.ai_render_stage === "narracao") return "Gerando narração";
    if (job.ai_render_stage === "montagem" || job.ai_render_stage === "render") return "Montando vídeo";
  }
  return JOB_STATUS_LABELS[job.status];
}

export type RoteiroBloco = { tempo: string; orientacao: string; fala: string };

export type DbJob = {
  id: string;
  product_id: string | null;
  profile_id: string;
  status: JobStatusKey;
  title: string;
  /** "completo" = vídeo inteiro com IA. "gravacao" = a pessoa grava lendo o teleprompter. */
  formato: "completo" | "gravacao";
  roteiro_blocos?: RoteiroBloco[] | null;
  texto_tela?: string | null;
  recorded_at?: string | null;
  created_at: string;
  script: string | null;
  hook: string | null;
  post_cta: string | null;
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
  voice_ref: string | null;
  video_path?: string | null;
  video_original_path?: string | null;
  /** Gravação editada preservada mesmo quando a versão ativa é outra. */
  video_edited_path?: string | null;
  /** Versão ativa do vídeo próprio: gravado | gravado_editado | ia. */
  video_choice?: "gravado" | "gravado_editado" | "ia" | null;
  /** Trilha da versão gerada por IA dentro do modal do vídeo próprio. */
  ai_status?: string | null;
  ai_render_stage?: string | null;
  ai_render_error?: string | null;
  ai_video_url?: string | null;
  ai_video_path?: string | null;
  ai_video_thumbnail_url?: string | null;
  video_edits?: unknown;
  published_url?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  rejection_reason?: string | null;
  deleted_at?: string | null;
  deleted_from_status?: JobStatusKey | null;
  /** Vídeos campeões usados como referência ao gerar o roteiro. */
  script_refs?: ChampionRef[] | null;
  visual_style_override?: VisualStyle | null;
  visual_style_custom?: string | null;
};

export type ChampionRef = {
  videoId: string;
  title: string;
  views: number;
  revenue: number;
  creator: string;
  url: string;
};

export type VideoScene = {
  narration: string;
  image_prompt: string;
  motion_prompt: string;
  overlay_text: string;
  image_url?: string;
  video_url?: string;
  operation?: string;
  attempts?: number;
  approved?: boolean;
};

export type DbVideoSettings = {
  profile_id: string;
  avatar_mode: "fixo" | "livre";
  avatar_reference_url: string | null;
  takes_count: number;
  gemini_model: string;
  veo_model: string;
  take_duration: number;
  recording_aspect_ratio: RecordingAspectRatio;
  visual_style: VisualStyle;
  visual_style_custom: string | null;
};

export function useVideoSettings(profileId: string | null) {
  return useQuery({
    queryKey: ["video-settings", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_video_settings")
        .select("profile_id, avatar_mode, avatar_reference_url, takes_count, gemini_model, veo_model, take_duration, recording_aspect_ratio, visual_style, visual_style_custom")
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

/** Catalogo do perfil ativo: sempre filtrado por profile_id no banco. */
export function useProducts(profileId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["products", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("profile_id", profileId!)
        .order("hype", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        ...p,
        price: Number(p.price),
        commission: Number(p.commission),
      })) as DbProduct[];
    },
    enabled: enabled && !!profileId,
  });
}

/** Itens na Lixeira do perfil ativo (soft delete). */
export function useTrashedJobs(profileId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["jobs-trash", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, product_id, profile_id, status, title, created_at, script, hook, post_cta, caption, hashtags, video_url, video_thumbnail_url, render_id, render_error, render_started_at, render_stage, scenes, gemini_images_count, veo_takes_count, voice_ref, video_path, video_original_path, video_edited_path, video_choice, video_edits, ai_status, ai_render_stage, ai_render_error, ai_video_url, ai_video_path, ai_video_thumbnail_url, published_url, approved_at, published_at, rejection_reason, script_refs, formato, roteiro_blocos, texto_tela, recorded_at, deleted_at, deleted_from_status, visual_style_override, visual_style_custom",
        )
        .eq("profile_id", profileId!)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DbJob[];
    },
    enabled: enabled && !!profileId,
  });
}

/** Jobs do perfil ativo: sempre filtrados por profile_id no banco. */
export function useJobs(profileId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["jobs", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, product_id, profile_id, status, title, created_at, script, hook, post_cta, caption, hashtags, video_url, video_thumbnail_url, render_id, render_error, render_started_at, render_stage, scenes, gemini_images_count, veo_takes_count, voice_ref, video_path, video_original_path, video_edited_path, video_choice, video_edits, ai_status, ai_render_stage, ai_render_error, ai_video_url, ai_video_path, ai_video_thumbnail_url, published_url, approved_at, published_at, rejection_reason, script_refs, formato, roteiro_blocos, texto_tela, recorded_at, deleted_at, deleted_from_status, visual_style_override, visual_style_custom",
        )
        .eq("profile_id", profileId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DbJob[];
    },
    enabled: enabled && !!profileId,
    // Enquanto houver etapa em andamento (cenas ou vídeo), reconsulta para o card avançar sozinho.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (j: DbJob) => j.status === "gerando_cenas" || j.status === "gerando_video" || !!j.render_stage || !!j.ai_render_stage,
      )
        ? 6000
        : false,
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
