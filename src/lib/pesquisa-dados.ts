/** Leitura de uma pesquisa com o login do usuário (tela e assistente). */
import type { VideoSnap } from "./metricas-calc";
import { videoIdDoLink, type AnaliseRef, type VideoRef } from "./referencias-dados";
import type { VideoPesquisa } from "./pesquisa-calc";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function lerDadosPesquisa(db: Any, pesquisaId: string) {
  const [vs, an] = await Promise.all([
    db.from("pesquisas_tiktok_videos").select("*").eq("pesquisa_id", pesquisaId).order("posicao").limit(200),
    db.from("video_analises").select("id, status, etapa, link_url, resultado, custo_cents, erro, created_at").eq("pesquisa_id", pesquisaId).order("created_at", { ascending: false }).limit(200),
  ]);
  const videos = ((vs.data ?? []) as Any[]).map((v) => ({ ...v, duracao: v.duracao == null ? null : Number(v.duracao), hashtags: v.hashtags ?? [] })) as VideoPesquisa[];
  const analises: AnaliseRef[] = ((an.data ?? []) as Any[]).map((a) => ({ ...a, custo_cents: Number(a.custo_cents ?? 0), video_id: videoIdDoLink(a.link_url) }));
  return { videos, analises };
}

/** Adapta os vídeos da pesquisa ao formato dos Perfis de referência (insights e componentes compartilhados). */
export function comoReferencia(videos: VideoPesquisa[]): { videos: VideoRef[]; snaps: VideoSnap[] } {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    videos: videos.map((v) => ({ tiktok_video_id: v.tiktok_video_id, url: v.url, legenda: v.legenda, publicado_em: v.publicado_em, duracao: v.duracao, capa_path: v.capa_path })),
    snaps: videos.map((v) => ({ tiktok_video_id: v.tiktok_video_id, job_id: null, data: hoje, views: v.views, likes: v.likes, comentarios: v.comentarios, compartilhamentos: v.compartilhamentos, salvos: v.salvos, reposts: v.reposts })) as VideoSnap[],
  };
}
