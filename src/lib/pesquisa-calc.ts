/** Contas da tela Pesquisar (tela, servidor e assistente usam as mesmas). */

const PT = /\b(voc[eê]|pra|para|n[aã]o|que|com|muito|isso|esse|essa|meu|minha|tamb[eé]m|mais|como|aqui|agora|melhor|produto|comprar|link|amei|gente|olha|dica|tudo|uma|pele|cabelo|casa)\b/gi;
const EN = /\b(the|and|you|this|my|for|with|is|are|your|what|how|best|love|get|it's|i'm|that|just|so|can|don't|these)\b/gi;
const PT_CHARS = /[ãõçâêô]/gi;

/** Idioma provável da legenda: true = provavelmente português. Sem texto útil conta como português. */
export function provavelPortugues(texto: string | null | undefined): boolean {
  const t = (texto ?? "").replace(/#[\p{L}\d_]+/gu, " ").replace(/@[\w.]+/g, " ");
  const pt = (t.match(PT)?.length ?? 0) + (t.match(PT_CHARS)?.length ?? 0);
  const en = t.match(EN)?.length ?? 0;
  if (!pt && !en) return true;
  return pt >= en;
}

export type VideoPesquisa = {
  tiktok_video_id: string; url: string; legenda: string | null; publicado_em: string | null; duracao: number | null;
  capa_path: string | null; autor_handle: string | null; autor_nome: string | null; autor_seguidores: number | null;
  views: number | null; likes: number | null; comentarios: number | null; compartilhamentos: number | null; salvos: number | null; reposts: number | null;
  hashtags: string[]; anuncio: boolean; fotos: boolean; tiktok_shop: boolean; idioma_pt: boolean; idioma?: string | null;
};

export const engajamentoVideo = (v: Pick<VideoPesquisa, "views" | "likes" | "comentarios" | "compartilhamentos" | "salvos">) => {
  const views = Number(v.views ?? 0);
  if (!views) return null;
  const soma = Number(v.likes ?? 0) + Number(v.comentarios ?? 0) + Number(v.compartilhamentos ?? 0) + Number(v.salvos ?? 0);
  return Math.round((soma / views) * 1000) / 10;
};

/** Resumo: anúncios ficam fora das médias; carrosséis (Fotos) ficam fora da duração média. */
export function resumoPesquisa(videos: VideoPesquisa[], termo: string) {
  const base = videos.filter((v) => !v.anuncio);
  const views = base.map((v) => Number(v.views ?? 0));
  const viewsMedia = base.length ? Math.round(views.reduce((s, x) => s + x, 0) / base.length) : null;
  const engs = base.map(engajamentoVideo).filter((x): x is number => x != null);
  const engMedio = engs.length ? engs.reduce((s, x) => s + x, 0) / engs.length : null;
  const durs = base.filter((v) => !v.fotos && v.duracao).map((v) => Number(v.duracao));
  const duracaoMedia = durs.length ? durs.reduce((s, x) => s + x, 0) / durs.length : null;
  const alvo = termo.replace(/^#/, "").toLowerCase();
  const tags = new Map<string, number>();
  for (const v of base) for (const h of new Set(v.hashtags.map((x) => x.toLowerCase()))) if (h && h !== alvo) tags.set(h, (tags.get(h) ?? 0) + 1);
  const autores = new Map<string, number>();
  for (const v of base) if (v.autor_handle) autores.set(v.autor_handle, (autores.get(v.autor_handle) ?? 0) + 1);
  const ord = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nome, qtd]) => ({ nome, qtd }));
  return {
    viewsMedia, engMedio, duracaoMedia,
    anuncios: videos.length - base.length, fotos: videos.filter((v) => v.fotos).length,
    hashtags: ord(tags, 20), autores: ord(autores, 10).filter((a) => a.qtd > 1),
  };
}
