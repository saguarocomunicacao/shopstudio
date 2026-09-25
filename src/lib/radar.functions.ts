import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function podeVer(supabase: Any, profileId: string) {
  const { data: bo } = await supabase.rpc("is_backoffice");
  if (bo) return true;
  const { data } = await supabase.rpc("minhas_permissoes");
  return ((data ?? []) as Any[]).some((p) => p.module === "metricas" && p.action === "visualizar" && (p.profile_id === profileId || p.profile_id === null));
}
async function assinar(paths: string[]) {
  const limpos = [...new Set(paths.filter(Boolean))];
  if (!limpos.length) return new Map<string, string>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("job-media").createSignedUrls(limpos, 3600);
  return new Map(((data ?? []) as Any[]).filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
}

export const listarRadarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), horas: z.union([z.literal(24), z.literal(72), z.literal(168)]), refId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    if (!(await podeVer(db, data.profileId))) return { semPermissao: true as const, acompanhados: [], itens: [] };
    const { data: refs } = await db.from("referencia_perfis").select("id, handle, acompanhar").eq("profile_id", data.profileId).is("meu_perfil_id", null).order("handle");
    const { listarRadar } = await import("./radar.server");
    const itens = await listarRadar(db, data.profileId, data.horas, data.refId);
    const urls = await assinar(itens.flatMap((i) => [i.capaPath, i.fotoPath]).filter(Boolean) as string[]);
    return {
      semPermissao: false as const,
      acompanhados: (refs ?? []) as { id: string; handle: string; acompanhar: boolean }[],
      itens: itens.map((i) => ({ ...i, capaUrl: i.capaPath ? urls.get(i.capaPath) ?? null : null, fotoUrl: i.fotoPath ? urls.get(i.fotoPath) ?? null : null })),
    };
  });

/** Card da Visão geral: vídeos em alta detectados hoje (24 h). */
export const resumoRadarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await context.supabase.from("radar_alertas").select("id", { count: "exact", head: true })
      .eq("profile_id", data.profileId).gte("detectado_em", desde).neq("status", "ignorado");
    return { hoje: count ?? 0 };
  });

export const marcarRadarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["visto", "usado", "ignorado"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: a } = await context.supabase.from("radar_alertas").select("id, profile_id").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Alerta não encontrado.");
    const { data: ok } = await context.supabase.rpc("can_view_profile", { _profile_id: (a as Any).profile_id });
    if (!ok) throw new Error("Sem permissão neste perfil.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("radar_alertas").update({ status: data.status, updated_at: new Date().toISOString() } as never).eq("id", data.id);
    return { ok: true };
  });

/** "Analisar": mesmo fluxo de Perfis de referência (fila, saldo, custo). */
export const analisarRadarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: a } = await context.supabase.from("radar_alertas").select("*").eq("id", data.id).maybeSingle();
    const al = a as Any;
    if (!al) throw new Error("Alerta não encontrado.");
    const { data: pode } = await context.supabase.rpc("can_edit_pipeline", { _profile_id: al.profile_id });
    if (!pode) throw new Error("Você não tem permissão para editar conteúdo neste perfil.");
    const { data: v } = await context.supabase.from("referencia_videos").select("*").eq("referencia_id", al.referencia_id).eq("tiktok_video_id", al.tiktok_video_id).maybeSingle();
    const { data: ref } = await context.supabase.from("referencia_perfis").select("id, tenant_id, profile_id, handle").eq("id", al.referencia_id).maybeSingle();
    if (!v || !ref) throw new Error("Esse vídeo não está mais na coleta do @.");
    const vid = v as Any;
    const r = ref as Any;
    const { assertSaldoPerfil } = await import("./saldo.server");
    await assertSaldoPerfil(r.profile_id, { analise_video: 1 });
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(r.tenant_id, ["apify", "gemini"]);
    const { enfileirarAnalises } = await import("./referencias.server");
    await enfileirarAnalises({ refId: r.id, userId: context.userId, videos: [{ id: vid.tiktok_video_id, url: vid.url, titulo: (vid.legenda ?? "").trim() || `Vídeo de @${r.handle}`, duracao: vid.duracao }] });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: an } = await supabaseAdmin.from("video_analises").select("id").eq("referencia_id", r.id).eq("link_url", vid.url).order("created_at", { ascending: false }).limit(1).maybeSingle();
    await supabaseAdmin.from("radar_alertas").update({ analise_id: (an as Any)?.id ?? null, status: "visto", updated_at: new Date().toISOString() } as never).eq("id", al.id);
    return { ok: true };
  });
