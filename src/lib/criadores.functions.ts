/**
 * Explorar > Criadores: ranking de criadores do TikTok Shop BR (Kalodata creator/rank).
 * Ficha (creator/detail) e vídeos mais vendidos (video/rank por criador) só ao abrir a linha.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASE = "https://www.kalodata.com/openapi/v1/tiktok";
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number.parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function kalodata(tenantId: string, path: string, body: Record<string, unknown>) {
  const { resolveApiKey } = await import("./api-keys.server");
  const key = await resolveApiKey(tenantId, "kalodata");
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "secret-key": key },
    body: JSON.stringify({ region: "BR", language: "pt-BR", currency: "BRL", ...body }),
  });
  if (!res.ok) {
    console.error("[criadores]", path, res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error("O Kalodata não respondeu agora. Tente de novo em instantes.");
  }
  const payload = (await res.json()) as { success?: boolean; data?: unknown; message?: string };
  if (payload.success === false) {
    console.error("[criadores]", path, payload.message);
    throw new Error("O Kalodata recusou a busca. Confira a chave em APIs.");
  }
  return payload.data;
}

async function contexto(supabase: Any, profileId: string) {
  const { data: bo } = await supabase.rpc("is_backoffice");
  if (!bo) {
    const { data } = await supabase.rpc("minhas_permissoes");
    const ok = ((data ?? []) as Any[]).some((p) => p.module === "produtos" && p.action === "visualizar" && (p.profile_id === profileId || p.profile_id === null));
    if (!ok) throw new Error("Sem permissão para ver produtos.");
  }
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", profileId).maybeSingle();
  if (!p) throw new Error("Perfil não encontrado.");
  return p.tenant_id as string;
}

export const buscarCriadores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    profileId: z.string().uuid(),
    categoryId: z.string().max(40).nullable().optional(),
    dateRange: z.enum(["last7Day", "last30Day"]).default("last30Day"),
    sortField: z.enum(["video_revenue", "revenue", "sales_volumn", "revenue_growth_rate", "creator_followers"]).default("video_revenue"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await contexto(context.supabase, data.profileId);
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(tenantId, ["kalodata"]);
    const { assertOrcamento } = await import("./orcamento.server");
    await assertOrcamento(data.profileId, { barata: true });
    const { assertSaldoPerfil } = await import("./saldo.server");
    await assertSaldoPerfil(data.profileId, { busca_produto: 1 });
    const bruto = await kalodata(tenantId, "creator/rank", {
      date_range: data.dateRange, page: 1, page_size: 50,
      sort_field: { field: data.sortField, type: "DESC" },
      ...(data.categoryId ? { category_ids: [data.categoryId] } : {}),
    });
    const rows = (Array.isArray(bruto) ? bruto : []) as Any[];
    const itens = rows.map((r) => {
      const receita = num(r.revenue);
      const video = num(r.video_revenue);
      const views = num(r.content_views);
      return {
        id: String(r.creator_id ?? ""), handle: String(r.creator_handle ?? "").replace(/^@/, "").toLowerCase(), nome: r.creator_nickname ?? null,
        seguidores: num(r.creator_followers), receita, receitaVideo: video, receitaLive: num(r.live_revenue),
        pctVideo: receita ? Math.round((video / receita) * 1000) / 10 : null,
        vendas: num(r.sales_volumn), crescimento: r.revenue_growth_rate == null ? null : num(r.revenue_growth_rate), views,
        receitaPorMilViews: views ? Math.round((receita / views) * 1000 * 100) / 100 : null,
      };
    }).filter((i) => i.id && i.handle);
    const { recordConsumo } = await import("./consumo.server");
    const eventoId = await recordConsumo({
      jobId: null, profileId: data.profileId, etapa: "busca_kalodata", acao: "busca_produto", modelo: "kalodata-creator-rank",
      quantidade: itens.length, unidade: "bloco_linhas_kalodata",
      metadados: { tipo: "ranking_criadores", periodo: data.dateRange, ordenacao: data.sortField, categoria: data.categoryId ?? null, linhas: itens.length },
    });
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { profileId: _p, ...filtros } = data;
      await supabaseAdmin.from("buscas_produto").insert({
        tenant_id: tenantId, profile_id: data.profileId, user_id: context.userId, origem: "criadores", termo: null,
        filtros: filtros as never, total: itens.length, resultados: itens as never, consumo_evento_id: eventoId,
      });
    } catch (e) {
      console.error("[criadores] guardar busca", e);
    }
    const { data: refs } = await context.supabase.from("referencia_perfis").select("handle").eq("profile_id", data.profileId);
    return { itens, acompanhados: ((refs ?? []) as Any[]).map((r) => String(r.handle).toLowerCase()) };
  });

/** Buscas recentes da aba Criadores. */
export const buscasRecentesCriadores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("buscas_produto").select("id, filtros, total, resultados, created_at")
      .eq("profile_id", data.profileId).eq("origem", "criadores").order("created_at", { ascending: false }).limit(8);
    const { data: refs } = await context.supabase.from("referencia_perfis").select("handle").eq("profile_id", data.profileId);
    return { itens: (rows ?? []) as Any[], acompanhados: ((refs ?? []) as Any[]).map((r) => String(r.handle).toLowerCase()) };
  });

/** Ficha do criador + vídeos que mais venderam. Custo registrado. */
export const fichaCriador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), creatorId: z.string().regex(/^\d{5,25}$/), dateRange: z.enum(["last7Day", "last30Day"]).default("last30Day") }).parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await contexto(context.supabase, data.profileId);
    const { assertTenantKeys } = await import("./api-keys.server");
    await assertTenantKeys(tenantId, ["kalodata"]);
    const [det, vids] = await Promise.all([
      kalodata(tenantId, "creator/detail", { creator_id: data.creatorId, date_range: data.dateRange }),
      kalodata(tenantId, "video/rank", { creator_id: data.creatorId, date_range: data.dateRange, page: 1, page_size: 10, sort_field: { field: "revenue", type: "DESC" } }).catch(() => []),
    ]);
    const d = (det ?? {}) as Any;
    const handle = String(d.creator_handle ?? "").replace(/^@/, "");
    const videos = ((Array.isArray(vids) ? vids : []) as Any[])
      .filter((v) => String(v.belonged_creator_id ?? data.creatorId) === data.creatorId)
      .slice(0, 5)
      .map((v) => ({
        id: String(v.video_id), titulo: String(v.video_title ?? "").trim() || "Vídeo sem título", receita: num(v.revenue), views: num(v.views),
        anuncio: !!v.ad, data: v.publish_date ? String(v.publish_date).slice(0, 10).replace(/\//g, "-") : null,
        url: `https://www.tiktok.com/@${handle || v.belonged_creator_handle}/video/${v.video_id}`,
      }));
    const { recordConsumo } = await import("./consumo.server");
    await recordConsumo({
      jobId: null, profileId: data.profileId, etapa: "busca_kalodata", acao: "busca_produto", modelo: "kalodata-creator-detail",
      quantidade: 1 + videos.length, unidade: "bloco_linhas_kalodata", semDebito: true,
      metadados: { tipo: "ficha_criador", creator_id: data.creatorId, handle },
    });
    return {
      handle, videosPeriodo: d.video_number == null ? null : num(d.video_number), lives: d.live_number == null ? null : num(d.live_number),
      novosSeguidores: d.new_followers == null ? null : num(d.new_followers), ticketMedio: d.unit_price == null ? null : num(d.unit_price),
      produtos: d.product_number == null ? null : num(d.product_number), lojas: d.shop_number == null ? null : num(d.shop_number),
      bio: d.creator_bio || null, email: d.creator_contact_email || null, whatsapp: d.creator_contact_whatsapp || null,
      videos,
    };
  });
