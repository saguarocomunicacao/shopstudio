/** Médias e linhas dos vídeos de uma referência (tela e assistente usam a mesma conta). */
import { engajamento, type VideoSnap } from "./metricas-calc";
import { ultimosNumeros, type VideoRef } from "./referencias-dados";

export type LinhaRef = VideoRef & { views: number; likes: number; comentarios: number; compartilhamentos: number; salvos: number; reposts: number; engajamentoPct: number | null; semDados: boolean };

export function mediasReferencia(videos: VideoRef[], snaps: VideoSnap[]) {
  const ult = ultimosNumeros(snaps);
  const linhas: LinhaRef[] = videos.map((v) => {
    const n = ult.get(v.tiktok_video_id);
    const t = {
      views: Number(n?.views ?? 0), likes: Number(n?.likes ?? 0), comentarios: Number(n?.comentarios ?? 0),
      compartilhamentos: Number(n?.compartilhamentos ?? 0), salvos: Number(n?.salvos ?? 0), reposts: Number(n?.reposts ?? 0),
    };
    return { ...v, ...t, engajamentoPct: engajamento(t), semDados: !n };
  });
  const comDados = linhas.filter((l) => !l.semDados);
  const viewsMedia = comDados.length ? Math.round(comDados.reduce((s, l) => s + l.views, 0) / comDados.length) : null;
  const engs = comDados.map((l) => l.engajamentoPct).filter((x): x is number => x != null);
  const engMedio = engs.length ? engs.reduce((s, x) => s + x, 0) / engs.length : null;
  const datas = linhas.map((l) => l.publicado_em).filter(Boolean).map((d) => new Date(d!).getTime()).sort((a, b) => a - b);
  const semanas = datas.length > 1 ? Math.max(1, (datas[datas.length - 1]! - datas[0]!) / (7 * 86400_000)) : null;
  const porSemana = semanas ? datas.length / semanas : null;
  const durs = linhas.map((l) => l.duracao).filter((x): x is number => !!x);
  const duracaoMedia = durs.length ? durs.reduce((s, x) => s + x, 0) / durs.length : null;
  const top = [...comDados].sort((a, b) => b.views - a.views).map((l) => ({ video: l.tiktok_video_id, legenda: (l.legenda ?? "").slice(0, 100), views: l.views, engajamento: l.engajamentoPct == null ? null : `${l.engajamentoPct.toFixed(1).replace(".", ",")}%`, link: l.url }));
  const f1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return {
    linhas, viewsMedia, engMedio, porSemana, duracaoMedia, top,
    textos: {
      views_por_video: viewsMedia == null ? null : viewsMedia.toLocaleString("pt-BR"),
      engajamento_medio: engMedio == null ? null : `${f1(engMedio)}%`,
      posts_por_semana: porSemana == null ? null : f1(porSemana),
      duracao_media: duracaoMedia == null ? null : `${Math.round(duracaoMedia)} s`,
    },
  };
}
