/**
 * Radar de concorrentes: depois de cada coleta de um @ de referência com acompanhamento diário,
 * procura vídeos novos (até 72 h) subindo acima do normal do próprio @ e entre os @ do mesmo perfil.
 * Sem coleta extra: usa só os dados já gravados por processarColetaRef.
 */
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const H = 3600_000;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function percentil(vals: number[], p: number) {
  if (!vals.length) return Infinity;
  const s = [...vals].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[i] ?? Infinity;
}

function engajamento(m: Any) {
  const v = Number(m.views ?? 0);
  if (!v) return null;
  const e = Number(m.likes ?? 0) + Number(m.comentarios ?? 0) + Number(m.compartilhamentos ?? 0) + Number(m.salvos ?? 0);
  return Math.round((e / v) * 1000) / 10;
}

/** Último snapshot de cada vídeo de uma lista de referências. */
async function ultimos(db: Any, refIds: string[]) {
  if (!refIds.length) return new Map<string, Any>();
  const desde = new Date(Date.now() - 35 * 24 * H).toISOString().slice(0, 10);
  const { data } = await db.from("referencia_video_metricas")
    .select("referencia_id, tiktok_video_id, data, views, likes, comentarios, compartilhamentos, salvos")
    .in("referencia_id", refIds).gte("data", desde).order("data", { ascending: true }).limit(20000);
  const m = new Map<string, Any>();
  for (const r of (data ?? []) as Any[]) m.set(`${r.referencia_id}:${r.tiktok_video_id}`, r);
  return m;
}

export async function detectarRadar(refId: string): Promise<number> {
  const db = await admin();
  const { data: r } = await db.from("referencia_perfis").select("*").eq("id", refId).maybeSingle();
  const ref = r as Any;
  if (!ref || !ref.acompanhar || ref.meu_perfil_id) return 0;

  const { data: refsPerfil } = await db.from("referencia_perfis").select("id, handle")
    .eq("profile_id", ref.profile_id).eq("acompanhar", true).is("meu_perfil_id", null);
  const refIds = ((refsPerfil ?? []) as Any[]).map((x) => x.id as string);
  const { data: vids } = await db.from("referencia_videos").select("referencia_id, tiktok_video_id, publicado_em").in("referencia_id", refIds);
  const snaps = await ultimos(db, refIds);
  const agora = Date.now();

  // Datas de snapshot do @ para "id que não existia no snapshot anterior".
  const { data: datas } = await db.from("referencia_perfil_metricas").select("data").eq("referencia_id", refId).order("data", { ascending: false }).limit(2);
  const dataAnterior = ((datas ?? []) as Any[])[1]?.data as string | undefined;
  let idsAnteriores = new Set<string>();
  if (dataAnterior) {
    const { data: ant } = await db.from("referencia_video_metricas").select("tiktok_video_id").eq("referencia_id", refId).eq("data", dataAnterior);
    idsAnteriores = new Set(((ant ?? []) as Any[]).map((a) => String(a.tiktok_video_id)));
  }

  const todos = ((vids ?? []) as Any[]).map((v) => {
    const s = snaps.get(`${v.referencia_id}:${v.tiktok_video_id}`);
    const pub = v.publicado_em ? new Date(v.publicado_em).getTime() : null;
    return { ...v, views: Number(s?.views ?? 0), snap: s, idadeH: pub ? (agora - pub) / H : null };
  });
  const doRef = todos.filter((v) => v.referencia_id === refId);

  const candidatos = doRef.filter((v) =>
    v.idadeH != null ? v.idadeH <= 72 : !!dataAnterior && !idsAnteriores.has(String(v.tiktok_video_id)),
  );
  if (!candidatos.length) return 0;
  const candIds = new Set(candidatos.map((c) => c.tiktok_video_id));

  // Base do próprio @: vídeos dos últimos 30 dias (fora os candidatos); sem data, todos.
  let base = doRef.filter((v) => !candIds.has(v.tiktok_video_id) && (v.idadeH == null || v.idadeH <= 30 * 24));
  if (base.length < 3) base = doRef.filter((v) => !candIds.has(v.tiktok_video_id));
  const media = base.length ? base.reduce((s, v) => s + v.views, 0) / base.length : 0;
  const p80 = base.length >= 3 ? percentil(base.map((v) => v.views), 0.8) : Infinity;

  // Nicho: top 10% dos vídeos novos da semana entre os @ acompanhados deste perfil.
  const semana = todos.filter((v) => v.idadeH != null && v.idadeH <= 7 * 24);
  const corteNicho = semana.length >= 5 ? percentil(semana.map((v) => v.views), 0.9) : Infinity;

  const { data: existentes } = await db.from("radar_alertas").select("tiktok_video_id").eq("referencia_id", refId);
  const jaTem = new Set(((existentes ?? []) as Any[]).map((e) => e.tiktok_video_id));
  let novos = 0;
  for (const c of candidatos) {
    if (!c.views) continue;
    const razao = media > 0 ? c.views / media : null;
    const acimaMedia = base.length >= 3 && razao != null && razao >= 2;
    const acimaP80 = c.views > p80;
    const nicho = c.views >= corteNicho;
    if (!acimaMedia && !acimaP80 && !nicho) continue;
    const janela = c.idadeH == null ? "" : c.idadeH <= 24 ? " em 24 h" : c.idadeH <= 48 ? " em 48 h" : " em 72 h";
    const razaoTexto = acimaMedia
      ? `${fmt(razao!)}x a média do perfil${janela}`
      : acimaP80 ? `Acima de 80% dos vídeos do perfil${janela}` : "Entre os 10% mais vistos do nicho na semana";
    const linha = {
      tenant_id: ref.tenant_id, profile_id: ref.profile_id, referencia_id: refId, tiktok_video_id: String(c.tiktok_video_id),
      views: c.views, engajamento_pct: c.snap ? engajamento(c.snap) : null,
      razao: razao != null ? Math.round(razao * 10) / 10 : null, razao_texto: razaoTexto, em_alta_nicho: nicho,
      updated_at: new Date().toISOString(),
    };
    if (jaTem.has(linha.tiktok_video_id)) {
      await db.from("radar_alertas").update(linha as never).eq("referencia_id", refId).eq("tiktok_video_id", linha.tiktok_video_id);
    } else {
      const { error } = await db.from("radar_alertas").insert(linha as never);
      if (!error) novos++;
    }
  }
  if (novos) await notificar(ref, novos);
  return novos;
}

async function notificar(ref: Any, n: number) {
  const db = await admin();
  const [{ data: upr }, { data: roles }] = await Promise.all([
    db.from("user_profile_roles").select("user_id, profile_id, role_id").eq("tenant_id", ref.tenant_id),
    db.from("roles").select("id, name, is_admin").eq("tenant_id", ref.tenant_id),
  ]);
  const ok = new Set(((roles ?? []) as Any[]).filter((r) => r.is_admin || ["admin", "administrador", "gerente"].includes(String(r.name).toLowerCase())).map((r) => r.id));
  const users = [...new Set(((upr ?? []) as Any[])
    .filter((u) => ok.has(u.role_id) && (u.profile_id === ref.profile_id || u.profile_id === null)).map((u) => u.user_id as string))];
  if (!users.length) return;
  const texto = n === 1 ? `Radar: 1 vídeo em alta de @${ref.handle}` : `Radar: ${n} vídeos em alta de @${ref.handle}`;
  await db.from("notificacoes").insert(users.map((u) => ({ tenant_id: ref.tenant_id, user_id: u, tipo: "radar", texto, origem: "radar" })) as never);
}

/** Lista para tela/assistente. Recebe um client com RLS do usuário. */
export async function listarRadar(db: Any, profileId: string, horas: number, refId?: string | null) {
  const desde = new Date(Date.now() - horas * H).toISOString();
  let q = db.from("radar_alertas").select("*").eq("profile_id", profileId).gte("detectado_em", desde).neq("status", "ignorado");
  if (refId) q = q.eq("referencia_id", refId);
  const { data: al } = await q.limit(200);
  const alertas = (al ?? []) as Any[];
  const refIds = [...new Set(alertas.map((a) => a.referencia_id))];
  const [{ data: refs }, { data: vids }, { data: ans }] = await Promise.all([
    refIds.length ? db.from("referencia_perfis").select("id, handle, nome, foto_path").in("id", refIds) : Promise.resolve({ data: [] }),
    refIds.length ? db.from("referencia_videos").select("referencia_id, tiktok_video_id, url, legenda, publicado_em, capa_path, duracao").in("referencia_id", refIds) : Promise.resolve({ data: [] }),
    refIds.length ? db.from("video_analises").select("id, referencia_id, link_url, status, resultado, created_at").in("referencia_id", refIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const refMap = new Map(((refs ?? []) as Any[]).map((r) => [r.id, r]));
  const vidMap = new Map(((vids ?? []) as Any[]).map((v) => [`${v.referencia_id}:${v.tiktok_video_id}`, v]));
  const itens = alertas.map((a) => {
    const v = vidMap.get(`${a.referencia_id}:${a.tiktok_video_id}`) ?? {};
    const an = a.analise_id
      ? ((ans ?? []) as Any[]).find((x) => x.id === a.analise_id)
      : ((ans ?? []) as Any[]).find((x) => x.referencia_id === a.referencia_id && String(x.link_url ?? "").includes(a.tiktok_video_id));
    const ref = refMap.get(a.referencia_id) ?? {};
    return {
      id: a.id as string, referenciaId: a.referencia_id as string, videoId: a.tiktok_video_id as string,
      handle: ref.handle as string, nome: ref.nome ?? null, fotoPath: ref.foto_path ?? null,
      url: v.url ?? `https://www.tiktok.com/@${ref.handle}/video/${a.tiktok_video_id}`,
      legenda: v.legenda ?? null, publicadoEm: v.publicado_em ?? null, capaPath: v.capa_path ?? null, duracao: v.duracao ?? null,
      views: Number(a.views), engajamentoPct: a.engajamento_pct != null ? Number(a.engajamento_pct) : null,
      razao: a.razao != null ? Number(a.razao) : null, razaoTexto: a.razao_texto as string, emAltaNicho: !!a.em_alta_nicho,
      status: a.status as string, detectadoEm: a.detectado_em as string,
      analise: an ? { id: an.id as string, status: an.status as string, gancho: an.resultado?.gancho?.texto ?? null, resumo: an.resultado?.resumo ?? null } : null,
    };
  });
  itens.sort((x, y) => (y.razao ?? 0) - (x.razao ?? 0) || y.views - x.views);
  return itens;
}
