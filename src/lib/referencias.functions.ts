import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dadosParaInsights, lerDadosReferencia } from "./referencias-dados";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function podeVer(supabase: Any, profileId: string) {
  const { data: bo } = await supabase.rpc("is_backoffice");
  if (bo) return true;
  const { data } = await supabase.rpc("minhas_permissoes");
  return ((data ?? []) as Any[]).some((p) => p.module === "metricas" && p.action === "visualizar" && (p.profile_id === profileId || p.profile_id === null));
}
async function assertEditar(supabase: Any, profileId: string) {
  const { data, error } = await supabase.rpc("can_edit_pipeline", { _profile_id: profileId });
  if (error || !data) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
}
async function carregarRef(supabase: Any, refId: string) {
  const { data } = await supabase.from("referencia_perfis").select("*").eq("id", refId).maybeSingle();
  if (!data) throw new Error("Referência não encontrada.");
  return data as Any;
}
async function assinar(paths: string[]) {
  const limpos = [...new Set(paths.filter(Boolean))];
  if (!limpos.length) return new Map<string, string>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("job-media").createSignedUrls(limpos, 3600);
  return new Map(((data ?? []) as Any[]).filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
}

/** Lista de referências do perfil do topo. */
export const listarReferencias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    if (!(await podeVer(db, data.profileId))) return { semPermissao: true as const, itens: [] };
    const { data: refs } = await db.from("referencia_perfis").select("*").eq("profile_id", data.profileId).order("created_at");
    const lista = (refs ?? []) as Any[];
    const ids = lista.map((r) => r.id);
    const [an, custo] = await Promise.all([
      ids.length ? db.from("video_analises").select("referencia_id, status, custo_cents").in("referencia_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("consumo_eventos").select("tool_price_cents, metadados").eq("profile_id", data.profileId).in("metadados->>referencia_id" as never, ids) : Promise.resolve({ data: [] }),
    ]);
    const itens = [];
    for (const r of lista) {
      const d = await lerDadosReferencia(db, r);
      const p = d.perfil;
      const ult = p[p.length - 1] ?? null;
      const ant = p[p.length - 2] ?? null;
      const ans = ((an.data ?? []) as Any[]).filter((a) => a.referencia_id === r.id);
      const custoColeta = ((custo.data ?? []) as Any[]).filter((c) => c.metadados?.referencia_id === r.id).reduce((s, c) => s + Number(c.tool_price_cents ?? 0), 0);
      const coleta = r.meu_perfil_id
        ? (await db.from("metricas_coleta").select("status, ultima_coleta_em, ultimo_erro").eq("profile_id", r.meu_perfil_id).maybeSingle()).data
        : { status: r.status, ultima_coleta_em: r.ultima_coleta_em, ultimo_erro: r.ultimo_erro };
      itens.push({
        id: r.id, handle: r.handle, nome: r.nome, foto_path: r.foto_path, meuPerfil: !!r.meu_perfil_id, acompanhar: r.acompanhar,
        seguidores: ult?.seguidores ?? null, variacao: ult && ant && ult.seguidores != null && ant.seguidores != null ? ult.seguidores - ant.seguidores : null,
        videos: d.videos.length, analisados: ans.filter((a) => a.status === "pronto").length,
        status: (coleta as Any)?.status ?? "nunca", ultimaColeta: (coleta as Any)?.ultima_coleta_em ?? null, erro: (coleta as Any)?.ultimo_erro ?? null,
        custoCents: custoColeta + ans.reduce((s, a) => s + Number(a.custo_cents ?? 0), 0),
      });
    }
    const fotos = await assinar(itens.map((i) => i.foto_path).filter(Boolean) as string[]);
    return { semPermissao: false as const, itens: itens.map((i) => ({ ...i, fotoUrl: i.foto_path ? fotos.get(i.foto_path) ?? null : null })) };
  });

/** Detalhe de um @. */
export const getReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const ref = await carregarRef(db, data.refId);
    const d = await lerDadosReferencia(db, ref);
    const coleta = ref.meu_perfil_id
      ? (await db.from("metricas_coleta").select("status, ultima_coleta_em, ultimo_erro").eq("profile_id", ref.meu_perfil_id).maybeSingle()).data
      : { status: ref.status, ultima_coleta_em: ref.ultima_coleta_em, ultimo_erro: ref.ultimo_erro };
    const urls = await assinar([...d.videos.map((v) => v.capa_path ?? ""), ref.foto_path ?? ""]);
    const { data: podeEditar } = await db.rpc("can_edit_pipeline", { _profile_id: ref.profile_id });
    return {
      ref: { ...ref, fotoUrl: ref.foto_path ? urls.get(ref.foto_path) ?? null : null },
      coleta, podeEditar: !!podeEditar,
      perfil: d.perfil, snaps: d.snaps, analises: d.analises.map(({ resultado: _r, ...a }) => ({ ...a, pronta: !!_r })),
      videos: d.videos.map((v) => ({ ...v, capaUrl: v.capa_path ? urls.get(v.capa_path) ?? null : null })),
    };
  });

export const adicionarReferenciaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), handle: z.string().trim().min(2).max(200), qtd: z.union([z.literal(20), z.literal(50), z.literal(100)]), acompanhar: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditar(context.supabase, data.profileId);
    const { data: p } = await context.supabase.from("profiles").select("tenant_id").eq("id", data.profileId).maybeSingle();
    if (!p) throw new Error("Perfil não encontrado.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["apify"]);
    const { adicionarReferencia } = await import("./referencias.server");
    return adicionarReferencia({ ...data, tenantId: p.tenant_id, userId: context.userId });
  });

export const atualizarReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    await assertEditar(context.supabase, ref.profile_id);
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(ref.tenant_id, ["apify"]);
    const { iniciarColetaRef } = await import("./referencias.server");
    await iniciarColetaRef(ref.id, true);
    return { ok: true };
  });

export const opcoesReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid(), acompanhar: z.boolean().optional(), fonteRoteirista: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    await assertEditar(context.supabase, ref.profile_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.acompanhar !== undefined) patch["acompanhar"] = data.acompanhar;
    if (data.fonteRoteirista !== undefined) patch["fonte_roteirista"] = data.fonteRoteirista;
    await supabaseAdmin.from("referencia_perfis").update(patch as never).eq("id", ref.id);
    return { ok: true };
  });

export const removerReferenciaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    await assertEditar(context.supabase, ref.profile_id);
    const { removerReferencia } = await import("./referencias.server");
    await removerReferencia(ref.id);
    return { ok: true };
  });

/** Com a tela aberta: avança a coleta e a fila de análises. */
export const avancarReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    const srv = await import("./referencias.server");
    let status = "nada";
    if (ref.meu_perfil_id) {
      const { processarColeta } = await import("./metricas.server");
      status = await processarColeta(ref.meu_perfil_id);
    } else if (ref.status === "coletando") {
      status = await srv.processarColetaRef(ref.id);
    }
    const promovidos = await srv.promoverFila(ref.tenant_id);
    return { status, promovidos };
  });

/** "Analisar selecionados": cria as análises na fila (máx. 5 em paralelo). */
export const analisarVideosRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid(), videoIds: z.array(z.string().min(5).max(30)).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    await assertEditar(context.supabase, ref.profile_id);
    const d = await lerDadosReferencia(context.supabase, ref);
    const jaTem = new Set(d.analises.filter((a) => a.status !== "erro").map((a) => a.video_id));
    const escolhidos = d.videos.filter((v) => data.videoIds.includes(v.tiktok_video_id) && !jaTem.has(v.tiktok_video_id));
    if (!escolhidos.length) throw new Error("Esses vídeos já foram analisados ou estão na fila.");
    const { assertSaldoPerfil } = await import("./saldo.server");
    await assertSaldoPerfil(ref.profile_id, { analise_video: escolhidos.length });
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(ref.tenant_id, ["apify", "gemini"]);
    const { enfileirarAnalises } = await import("./referencias.server");
    const n = await enfileirarAnalises({
      refId: ref.id, userId: context.userId,
      videos: escolhidos.map((v) => ({ id: v.tiktok_video_id, url: v.url, titulo: (v.legenda ?? "").trim() || `Vídeo de @${ref.handle}`, duracao: v.duracao })),
    });
    return { criadas: n };
  });

/** Aba Insights: gera (ou gera de novo) com 5+ vídeos analisados. */
export const gerarInsightsRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    await assertEditar(context.supabase, ref.profile_id);
    const d = await lerDadosReferencia(context.supabase, ref);
    const dados = dadosParaInsights(d.videos, d.snaps, d.analises);
    if (dados.length < 5) throw new Error("Os insights precisam de pelo menos 5 vídeos analisados.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(ref.tenant_id, ["gemini"]);
    const { data: prof } = await context.supabase.from("profiles").select("name, niche").eq("id", ref.profile_id).maybeSingle();
    const { gerarInsights } = await import("./referencias.server");
    const texto = await gerarInsights(ref.id, dados, { nome: prof?.name ?? "", nicho: prof?.niche ?? "" });
    return { texto };
  });


/** Insights: envia as recomendações para as observações de estilo do perfil (aba Identidade). */
export const enviarRecomendacoesRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ refId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ref = await carregarRef(context.supabase, data.refId);
    const { data: ok, error } = await context.supabase.rpc("can_edit_profile", { _profile_id: ref.profile_id });
    if (error || !ok) throw new Error("Você não tem permissão para editar a identidade deste perfil.");
    const { enviarRecomendacoes } = await import("./referencias.server");
    await enviarRecomendacoes(ref.id);
    return { ok: true };
  });
