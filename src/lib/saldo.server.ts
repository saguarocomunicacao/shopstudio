/**
 * Carteira de saldo por quantidade (tenant x ação).
 *
 * Modelo: o cliente compra PACOTES de cada ação (quantidade por um preço) e as
 * quantidades não expiram. Cada geração consome 1 unidade da ação.
 * Regra especial: pacote com preço ZERO (ou ação sem pacote no plano) significa
 * SALDO INFINITO — nunca trava e nunca debita.
 */
import type { BillableAction } from "./custo-core";
import { ACAO_LABELS } from "./custo-core";

type Admin = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export type SaldoNeeds = Partial<Record<BillableAction, number>>;

export type PacotePlano = { qty: number; priceCents: number };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Pacotes do plano vigente do cliente, por ação. */
export async function planPricing(tenantId: string): Promise<Map<BillableAction, PacotePlano>> {
  const db = await admin();
  const mapa = new Map<BillableAction, PacotePlano>();
  const { data: tenant } = await db.from("tenants").select("plan_id").eq("id", tenantId).maybeSingle();
  const planId = tenant?.plan_id ?? null;
  if (!planId) return mapa;
  const { data } = await db
    .from("plan_action_prices")
    .select("action_type, package_qty, package_price_cents")
    .eq("plan_id", planId);
  for (const row of (data ?? []) as Array<{ action_type: BillableAction; package_qty: number | null; package_price_cents: number | null }>) {
    mapa.set(row.action_type, {
      qty: Number(row.package_qty ?? 1) || 1,
      priceCents: Number(row.package_price_cents ?? 0) || 0,
    });
  }
  return mapa;
}

/** Ação gratuita no plano = saldo infinito (plano interno, parceiro BYOK, etc). */
export function saldoInfinito(pricing: Map<BillableAction, PacotePlano>, action: BillableAction) {
  const pacote = pricing.get(action);
  return !pacote || pacote.priceCents <= 0;
}

/** Saldo atual por ação (quantidade). */
export async function getSaldos(tenantId: string): Promise<Partial<Record<BillableAction, number>>> {
  const db = await admin();
  const { data } = await db.from("tenant_action_balances").select("action_type, saldo").eq("tenant_id", tenantId);
  const saldos: Partial<Record<BillableAction, number>> = {};
  for (const row of (data ?? []) as Array<{ action_type: BillableAction; saldo: number }>) {
    saldos[row.action_type] = Number(row.saldo ?? 0);
  }
  return saldos;
}

/** Erro amigável de saldo insuficiente (reconhecível pela interface). */
export class SemSaldo extends Error {
  readonly acoes: BillableAction[];
  constructor(faltando: Array<{ action: BillableAction; precisa: number; tem: number }>) {
    const lista = faltando
      .map((f) => `${ACAO_LABELS[f.action]} (precisa de ${f.precisa}, você tem ${f.tem})`)
      .join(", ");
    super(`Sem saldo de ${lista}. Compre mais para continuar — veja seu saldo em Minha conta.`);
    this.name = "SemSaldo";
    this.acoes = faltando.map((f) => f.action);
  }
}

/**
 * Trava ANTES de começar: confere se o cliente tem saldo de TODAS as ações que a
 * operação vai consumir. Nada é gerado quando falta qualquer uma.
 */
export async function assertSaldo(tenantId: string | null | undefined, needs: SaldoNeeds): Promise<void> {
  if (!tenantId) return;
  const entradas = Object.entries(needs).filter(([, qtd]) => (qtd ?? 0) > 0) as Array<[BillableAction, number]>;
  if (!entradas.length) return;

  const [pricing, saldos] = await Promise.all([planPricing(tenantId), getSaldos(tenantId)]);
  const faltando = entradas
    .filter(([action]) => !saldoInfinito(pricing, action))
    .map(([action, precisa]) => ({ action, precisa, tem: saldos[action] ?? 0 }))
    .filter((f) => f.tem < f.precisa);

  if (faltando.length) throw new SemSaldo(faltando);
}

/**
 * Debita 1 unidade (ou `qtd`) de forma ATÔMICA no banco. Devolve o id do
 * movimento gravado, ou null quando é saldo infinito / não havia saldo.
 */
export async function debitAction(
  tenantId: string,
  action: BillableAction,
  jobId: string | null = null,
  qtd = 1,
): Promise<string | null> {
  try {
    const pricing = await planPricing(tenantId);
    if (saldoInfinito(pricing, action)) return null;
    const db = await admin();
    const { data, error } = await db.rpc("debit_action_balance", {
      _tenant: tenantId,
      _action: action,
      _qty: qtd,
      _job: jobId,
    });
    if (error) {
      console.error("[saldo] falha ao debitar", action, error.message);
      return null;
    }
    if (!data) console.error("[saldo] consumo sem saldo disponível", { tenantId, action });
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("[saldo] falha ao debitar", e);
    return null;
  }
}

/** Ações (e quantidades) que um vídeo por IA completo vai consumir. */
export function needsVideoCompleto(opts: {
  cenas: number;
  comRoteiro?: boolean;
  comNarracao?: boolean;
  comCenas?: boolean;
}): SaldoNeeds {
  const cenas = Math.max(1, Math.round(opts.cenas || 1));
  const needs: SaldoNeeds = { video: cenas, montagem: 1 };
  if (opts.comCenas !== false) needs.cena = cenas;
  if (opts.comRoteiro) needs.roteiro = 1;
  if (opts.comNarracao) needs.narracao = 1;
  return needs;
}

/** Tenant dono do perfil (nulo quando não dá para resolver). */
export async function tenantOfProfile(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  const db = await admin();
  const { data } = await db.from("profiles").select("tenant_id").eq("id", profileId).maybeSingle();
  return (data?.tenant_id as string | null) ?? null;
}

/** Trava de saldo a partir do perfil (resolve o tenant sozinha). */
export async function assertSaldoPerfil(profileId: string | null | undefined, needs: SaldoNeeds) {
  await assertSaldo(await tenantOfProfile(profileId), needs);
}
