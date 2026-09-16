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
  gerando_video: "Gerando vídeo",
  video_pronto: "Vídeo pronto",
  rascunho_enviado: "Rascunho enviado",
  publicado: "Publicado",
};

export type DbJob = {
  id: string;
  product_id: string | null;
  profile_id: string;
  status: JobStatusKey;
  title: string;
  created_at: string;
};

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
        .select("id, product_id, profile_id, status, title, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DbJob[];
    },
    enabled,
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
