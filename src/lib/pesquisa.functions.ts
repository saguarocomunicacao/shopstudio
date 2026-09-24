import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comoReferencia, lerDadosPesquisa } from "./pesquisa-dados";
import { dadosParaInsights } from "./referencias-dados";

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
async function carregar(supabase: Any, id: string) {
  const { data } = await supabase.from("pesquisas_tiktok").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Pesquisa não encontrada.");
  return data as Any;
}
async function assinar(paths: string[]) {
  const limpos = [...new Set(paths.filter(Boolean))];
  if (!limpos.length) return new Map<string, string>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("job-media").createSignedUrls(limpos, 3600);
  return new Map(((data ?? []) as Any[]).filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
}

export const listarPesquisas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    if (!(await podeVer(db, data.profileId))) return { semPermissao: true as const, itens: [] };
    const { data: rows } = await db.from("pesquisas_tiktok").select("id, tipo, termo, qtd, status, erro, n_videos, custo_usd, created_at, sugestoes").eq("profile_id", data.profileId).order("created_at", { ascending: false }).limit(100);
    return { semPermissao: false as const, itens: (rows ?? []) as Any[] };
  });

export const getPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const p = await carregar(db, data.id);
    const d = await lerDadosPesquisa(db, p.id);
    const urls = await assinar(d.videos.map((v) => v.capa_path ?? ""));
    const { data: podeEditar } = await db.rpc("can_edit_pipeline", { _profile_id: p.profile_id });
    const { data: refs } = await db.from("referencia_perfis").select("handle").eq("profile_id", p.profile_id);
    return {
      pesquisa: p, podeEditar: !!podeEditar,
      acompanhados: ((refs ?? []) as Any[]).map((r) => String(r.handle)),
      analises: d.analises.map(({ resultado: _r, ...a }) => ({ ...a, pronta: !!_r })),
      videos: d.videos.map((v) => ({ ...v, capaUrl: v.capa_path ? urls.get(v.capa_path) ?? null : null })),
    };
  });

export const criarPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), tipo: z.enum(["hashtag", "palavra"]), termo: z.string().trim().min(2).max(100), qtd: z.union([z.literal(10), z.literal(30), z.literal(50)]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditar(context.supabase, data.profileId);
    const { data: p } = await context.supabase.from("profiles").select("tenant_id").eq("id", data.profileId).maybeSingle();
    if (!p) throw new Error("Perfil não encontrado.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["apify"]);
    const { iniciarPesquisa } = await import("./pesquisa.server");
    const id = await iniciarPesquisa({ ...data, tenantId: p.tenant_id, userId: context.userId });
    return { id };
  });

export const avancarPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await carregar(context.supabase, data.id);
    const srv = await import("./pesquisa.server");
    const status = p.status === "coletando" ? await srv.processarPesquisa(p.id) : "nada";
    const { promoverFila } = await import("./referencias.server");
    await promoverFila(p.tenant_id);
    return { status };
  });

export const removerPesquisaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await carregar(context.supabase, data.id);
    await assertEditar(context.supabase, p.profile_id);
    const { removerPesquisa } = await import("./pesquisa.server");
    await removerPesquisa(p.id);
    return { ok: true };
  });

export const analisarVideosPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), videoIds: z.array(z.string().min(5).max(30)).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await carregar(context.supabase, data.id);
    await assertEditar(context.supabase, p.profile_id);
    const d = await lerDadosPesquisa(context.supabase, p.id);
    const jaTem = new Set(d.analises.filter((a) => a.status !== "erro").map((a) => a.video_id));
    const escolhidos = d.videos.filter((v) => data.videoIds.includes(v.tiktok_video_id) && !jaTem.has(v.tiktok_video_id));
    if (!escolhidos.length) throw new Error("Esses vídeos já foram analisados ou estão na fila.");
    const { assertSaldoPerfil } = await import("./saldo.server");
    await assertSaldoPerfil(p.profile_id, { analise_video: escolhidos.length });
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["apify", "gemini"]);
    const { enfileirarAnalisesPesquisa } = await import("./pesquisa.server");
    const n = await enfileirarAnalisesPesquisa({
      pesquisaId: p.id, userId: context.userId,
      videos: escolhidos.map((v) => ({ url: v.url, titulo: (v.legenda ?? "").trim() || `Vídeo de @${v.autor_handle ?? ""}`, duracao: v.duracao })),
    });
    return { criadas: n };
  });

export const gerarInsightsPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await carregar(context.supabase, data.id);
    await assertEditar(context.supabase, p.profile_id);
    const d = await lerDadosPesquisa(context.supabase, p.id);
    const r = comoReferencia(d.videos);
    const dados = dadosParaInsights(r.videos, r.snaps, d.analises);
    if (dados.length < 5) throw new Error("Os insights precisam de pelo menos 5 vídeos analisados.");
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(p.tenant_id, ["gemini"]);
    const { data: prof } = await context.supabase.from("profiles").select("name, niche").eq("id", p.profile_id).maybeSingle();
    const rot = p.tipo === "hashtag" ? `#${p.termo}` : `"${p.termo}"`;
    const { gerarInsightsJson } = await import("./referencias.server");
    const json = await gerarInsightsJson({
      tenantId: p.tenant_id, profileId: p.profile_id, rotulo: `tema ${rot}`, dados,
      meuPerfil: { nome: prof?.name ?? "", nicho: prof?.niche ?? "" },
      meta: { tipo: "insights_pesquisa", pesquisa_id: p.id, termo: p.termo },
      contextoExtra: `\n\nCONTEXTO: estes vídeos não são de um único @. São vídeos de vários criadores encontrados na pesquisa do TikTok pelo tema ${rot}. Onde o texto fala do @, entenda "o tema".`,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pesquisas_tiktok").update({ insights: json, insights_em: new Date().toISOString() } as never).eq("id", p.id);
    return { texto: json };
  });

export const enviarRecomendacoesPesquisaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await carregar(context.supabase, data.id);
    const { data: ok, error } = await context.supabase.rpc("can_edit_profile", { _profile_id: p.profile_id });
    if (error || !ok) throw new Error("Você não tem permissão para editar a identidade deste perfil.");
    const { enviarRecomendacoesPesquisa } = await import("./pesquisa.server");
    await enviarRecomendacoesPesquisa(p.id);
    return { ok: true };
  });
