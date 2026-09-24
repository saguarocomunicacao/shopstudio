/**
 * Leitura de uma referência (tela e assistente usam a mesma função, com o login do usuário/RLS).
 * Perfil próprio ("meu perfil") lê das tabelas de Métricas, sem coleta duplicada.
 */
import type { PerfilSnap, VideoSnap } from "./metricas-calc";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type VideoRef = { tiktok_video_id: string; url: string; legenda: string | null; publicado_em: string | null; duracao: number | null; capa_path: string | null };
export type AnaliseRef = { id: string; status: string; etapa: string | null; link_url: string | null; resultado: Any; custo_cents: number; erro: string | null; video_id: string | null };

export const videoIdDoLink = (url: string | null | undefined) => (url ?? "").match(/\/(?:video|photo)\/(\d{8,25})/)?.[1] ?? null;

export async function lerDadosReferencia(db: Any, ref: { id: string; meu_perfil_id: string | null }) {
  let perfil: PerfilSnap[] = [];
  let snaps: VideoSnap[] = [];
  let videos: VideoRef[] = [];
  if (ref.meu_perfil_id) {
    const p = ref.meu_perfil_id;
    const [pm, vm, nv, jobs] = await Promise.all([
      db.from("perfil_metricas").select("data, seguidores, seguindo, curtidas_total, videos_total").eq("profile_id", p).order("data").limit(400),
      db.from("video_metricas").select("tiktok_video_id, job_id, data, views, likes, comentarios, compartilhamentos, salvos, reposts").eq("profile_id", p).order("data").limit(10000),
      db.from("videos_nao_vinculados").select("tiktok_video_id, url, legenda, publicado_em, duracao, capa_url").eq("profile_id", p).limit(500),
      db.from("jobs").select("title, tiktok_video_id, tiktok_video_url, published_at, video_original_duracao, video_edited_duracao, ai_video_duracao").eq("profile_id", p).not("tiktok_video_id", "is", null).is("deleted_at", null).limit(500),
    ]);
    perfil = (pm.data ?? []) as PerfilSnap[];
    snaps = (vm.data ?? []) as VideoSnap[];
    const mapa = new Map<string, VideoRef>();
    for (const v of (nv.data ?? []) as Any[]) mapa.set(v.tiktok_video_id, { tiktok_video_id: v.tiktok_video_id, url: v.url, legenda: v.legenda, publicado_em: v.publicado_em, duracao: v.duracao == null ? null : Number(v.duracao), capa_path: v.capa_url });
    for (const j of (jobs.data ?? []) as Any[]) {
      mapa.set(j.tiktok_video_id, {
        tiktok_video_id: j.tiktok_video_id, url: j.tiktok_video_url, legenda: j.title, publicado_em: j.published_at,
        duracao: Number(j.ai_video_duracao ?? j.video_edited_duracao ?? j.video_original_duracao ?? 0) || null,
        capa_path: mapa.get(j.tiktok_video_id)?.capa_path ?? null,
      });
    }
    videos = [...mapa.values()];
  } else {
    const [pm, vm, vs] = await Promise.all([
      db.from("referencia_perfil_metricas").select("data, seguidores, seguindo, curtidas_total, videos_total").eq("referencia_id", ref.id).order("data").limit(400),
      db.from("referencia_video_metricas").select("tiktok_video_id, data, views, likes, comentarios, compartilhamentos, salvos, reposts").eq("referencia_id", ref.id).order("data").limit(10000),
      db.from("referencia_videos").select("tiktok_video_id, url, legenda, publicado_em, duracao, capa_path").eq("referencia_id", ref.id).limit(500),
    ]);
    perfil = (pm.data ?? []) as PerfilSnap[];
    snaps = ((vm.data ?? []) as Any[]).map((s) => ({ ...s, job_id: null })) as VideoSnap[];
    videos = ((vs.data ?? []) as Any[]).map((v) => ({ ...v, duracao: v.duracao == null ? null : Number(v.duracao) }));
  }
  const { data: an } = await db.from("video_analises").select("id, status, etapa, link_url, resultado, custo_cents, erro, created_at").eq("referencia_id", ref.id).order("created_at", { ascending: false }).limit(500);
  const analises: AnaliseRef[] = ((an ?? []) as Any[]).map((a) => ({ ...a, custo_cents: Number(a.custo_cents ?? 0), video_id: videoIdDoLink(a.link_url) }));
  videos.sort((a, b) => (b.publicado_em ?? "").localeCompare(a.publicado_em ?? ""));
  return { perfil, snaps, videos, analises };
}

/** Números atuais por vídeo (último registro). */
export function ultimosNumeros(snaps: VideoSnap[]) {
  const m = new Map<string, VideoSnap>();
  for (const s of snaps) {
    const a = m.get(s.tiktok_video_id);
    if (!a || a.data <= s.data) m.set(s.tiktok_video_id, s);
  }
  return m;
}

/** JSON compacto de cada vídeo analisado + métricas, enviado à IA dos insights (e ao assistente). */
export function dadosParaInsights(videos: VideoRef[], snaps: VideoSnap[], analises: AnaliseRef[]) {
  const ult = ultimosNumeros(snaps);
  const porVideo = new Map(analises.filter((a) => a.status === "pronto" && a.resultado && a.video_id).map((a) => [a.video_id!, a]));
  return videos
    .filter((v) => porVideo.has(v.tiktok_video_id))
    .map((v) => {
      const r = porVideo.get(v.tiktok_video_id)!.resultado as Any;
      const n = ult.get(v.tiktok_video_id);
      const views = Number(n?.views ?? 0);
      const soma = Number(n?.likes ?? 0) + Number(n?.comentarios ?? 0) + Number(n?.compartilhamentos ?? 0) + Number(n?.salvos ?? 0);
      const cenas = (r?.cenas ?? []) as Any[];
      const cenaProduto = cenas.find((c) => c?.produto_visivel && !/^(n[aã]o|nenhum|-)?$/i.test(String(c.produto_visivel).trim()));
      return {
        video: v.tiktok_video_id,
        legenda: (v.legenda ?? "").slice(0, 120),
        publicado: v.publicado_em?.slice(0, 10) ?? null,
        duracao_s: v.duracao ?? r?.duracao_segundos ?? null,
        gancho: r?.gancho?.texto ?? null,
        formato: r?.formato ?? null,
        tom: r?.tom_de_voz ?? null,
        ritmo_cortes_min: r?.ritmo?.cortes_por_minuto ?? null,
        pessoa_ou_mao: [...new Set(cenas.map((c) => c?.pessoa_ou_mao).filter(Boolean))].slice(0, 3).join(" / ") || null,
        produto: r?.produto?.nome ?? null,
        produto_aparece_s: cenaProduto ? Number(cenaProduto.inicio ?? 0) : null,
        produto_nos_2s: cenaProduto ? Number(cenaProduto.inicio ?? 99) <= 2 : false,
        texto_tela: cenas.map((c) => c?.texto_na_tela).filter(Boolean).slice(0, 3).join(" | ") || null,
        cta: r?.cta?.texto ?? null,
        metricas: { views, likes: n?.likes ?? null, comentarios: n?.comentarios ?? null, compartilhamentos: n?.compartilhamentos ?? null, salvos: n?.salvos ?? null, engajamento_pct: views ? Math.round((soma / views) * 1000) / 10 : null },
      };
    });
}
