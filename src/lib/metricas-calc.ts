/**
 * Cálculo das métricas a partir dos snapshots diários.
 * Usado pela tela Métricas, pela Visão geral e pelo assistente (mesma fonte).
 */
export type PerfilSnap = { data: string; seguidores: number | null; seguindo: number | null; curtidas_total: number | null; videos_total: number | null };
export type VideoSnap = {
  tiktok_video_id: string;
  job_id: string | null;
  data: string;
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  salvos: number | null;
  reposts: number | null;
};
export type JobMetricaBase = { id: string; title: string; formato: string; video_choice?: string | null; published_at: string | null; tiktok_video_id: string | null; tiktok_video_url: string | null };

const TZ = "America/Sao_Paulo";
export const hojeBr = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const diaMenos = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const diaBrDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const v = (x: number | null | undefined) => Number(x ?? 0) || 0;

export const engajamento = (m: { views: number; likes: number; comentarios: number; compartilhamentos: number; salvos: number }) =>
  m.views > 0 ? ((m.likes + m.comentarios + m.compartilhamentos + m.salvos) / m.views) * 100 : null;

type Totais = { views: number; likes: number; comentarios: number; compartilhamentos: number; salvos: number; reposts: number };
const zero = (): Totais => ({ views: 0, likes: 0, comentarios: 0, compartilhamentos: 0, salvos: 0, reposts: 0 });
const CAMPOS = ["views", "likes", "comentarios", "compartilhamentos", "salvos", "reposts"] as const;

function porVideo(snaps: VideoSnap[]) {
  const m = new Map<string, VideoSnap[]>();
  for (const s of snaps) {
    const l = m.get(s.tiktok_video_id) ?? [];
    l.push(s);
    m.set(s.tiktok_video_id, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.data.localeCompare(b.data));
  return m;
}

/**
 * Crescimento de um vídeo no período [inicio, fim]:
 * último valor até o fim menos o último valor antes do início.
 * Sem registro anterior: se foi publicado dentro do período, conta tudo; senão usa o primeiro registro do período.
 */
function deltaVideo(l: VideoSnap[], inicio: string, fim: string, publicadoEm: string | null): Totais {
  const ate = l.filter((s) => s.data <= fim);
  const ult = ate[ate.length - 1];
  if (!ult) return zero();
  const antes = l.filter((s) => s.data < inicio);
  let base: VideoSnap | null = antes[antes.length - 1] ?? null;
  if (!base) {
    const pubDentro = publicadoEm ? diaBrDe(publicadoEm) >= inicio : false;
    base = pubDentro ? null : ate.find((s) => s.data >= inicio) ?? null;
  }
  const r = zero();
  for (const c of CAMPOS) r[c] = Math.max(0, v(ult[c]) - v(base?.[c]));
  return r;
}

export type ResumoMetricas = {
  atualizadoEm: string | null;
  seguidores: number | null;
  seguidoresVariacao: number | null;
  views: number;
  likes: number;
  comentarios: number;
  compartilhamentos: number;
  salvos: number;
  reposts: number;
  engajamentoPct: number | null;
  videosPublicados: number;
  serie: { dia: string; seguidores: number | null; views: number }[];
};

export function resumirMetricas(opts: {
  perfil: PerfilSnap[];
  videos: VideoSnap[];
  jobs: JobMetricaBase[];
  dias: number;
  /** Quando definido, só vídeos vinculados a jobs desse conjunto entram nas somas. */
  jobIds?: Set<string> | null;
  publicadoPorVideo?: Map<string, string | null>;
}): ResumoMetricas {
  const fim = hojeBr();
  const inicio = diaMenos(fim, opts.dias - 1);
  const perfil = [...opts.perfil].sort((a, b) => a.data.localeCompare(b.data));
  const ultPerfil = perfil[perfil.length - 1] ?? null;
  const basePerfil = [...perfil].reverse().find((p) => p.data < inicio) ?? perfil.find((p) => p.data >= inicio) ?? null;

  const snaps = opts.jobIds ? opts.videos.filter((s) => s.job_id && opts.jobIds!.has(s.job_id)) : opts.videos;
  const grupos = porVideo(snaps);
  const tot = zero();
  const viewsDia = new Map<string, number>();
  for (const [vid, l] of grupos) {
    const d = deltaVideo(l, inicio, fim, opts.publicadoPorVideo?.get(vid) ?? null);
    for (const c of CAMPOS) tot[c] += d[c];
    for (let i = 1; i < l.length; i++) {
      const dia = l[i]!.data;
      if (dia < diaMenos(fim, 29)) continue;
      viewsDia.set(dia, (viewsDia.get(dia) ?? 0) + Math.max(0, v(l[i]!.views) - v(l[i - 1]!.views)));
    }
  }
  const segPorDia = new Map(perfil.map((p) => [p.data, p.seguidores]));
  const serie: ResumoMetricas["serie"] = [];
  for (let i = 29; i >= 0; i--) {
    const dia = diaMenos(fim, i);
    serie.push({ dia, seguidores: segPorDia.get(dia) ?? null, views: viewsDia.get(dia) ?? 0 });
  }
  const videosPublicados = opts.jobs.filter((j) => (!opts.jobIds || opts.jobIds.has(j.id)) && j.published_at && diaBrDe(j.published_at) >= inicio).length;
  return {
    atualizadoEm: ultPerfil?.data ?? null,
    seguidores: ultPerfil?.seguidores ?? null,
    seguidoresVariacao: ultPerfil && basePerfil && ultPerfil.seguidores != null && basePerfil.seguidores != null ? ultPerfil.seguidores - basePerfil.seguidores : null,
    ...tot,
    engajamentoPct: engajamento(tot),
    videosPublicados,
    serie,
  };
}

export type LinhaVideo = JobMetricaBase & Totais & { engajamentoPct: number | null; curva: { dia: string; views: number }[]; semDados: boolean };

/** Números atuais (último registro) de cada vídeo publicado + curva de 14 dias. */
export function linhasVideos(jobs: JobMetricaBase[], videos: VideoSnap[]): LinhaVideo[] {
  const grupos = porVideo(videos);
  const lim = diaMenos(hojeBr(), 13);
  return jobs.map((j) => {
    const l = (j.tiktok_video_id ? grupos.get(j.tiktok_video_id) : undefined) ?? [];
    const ult = l[l.length - 1];
    const t = zero();
    if (ult) for (const c of CAMPOS) t[c] = v(ult[c]);
    return { ...j, ...t, engajamentoPct: engajamento(t), curva: l.filter((s) => s.data >= lim).map((s) => ({ dia: s.data, views: v(s.views) })), semDados: !ult };
  });
}

export const formatoLabel = (j: { formato: string; video_choice?: string | null }) =>
  j.formato === "externo" ? "Externo" : j.formato === "gravacao" ? (j.video_choice === "ia" ? "IA" : "Gravado") : "IA";

/** Extrai o ID do vídeo de um link completo do TikTok. */
export function idDoLinkTiktok(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.toLowerCase().endsWith("tiktok.com")) return null;
    return u.pathname.match(/\/(?:video|photo)\/(\d{8,25})/)?.[1] ?? null;
  } catch {
    return null;
  }
}
export const ehLinkTiktok = (url: string) => {
  try {
    return new URL(url.trim()).hostname.toLowerCase().endsWith("tiktok.com");
  } catch {
    return false;
  }
};
