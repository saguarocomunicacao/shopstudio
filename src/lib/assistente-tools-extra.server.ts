/**
 * Consultas extras do assistente (cobertura completa das telas).
 * Todas leem com o login do usuário (RLS) e seguem o mesmo portão de acesso da tela.
 */
import { tool } from "ai";
import { z } from "zod";
import { JOB_STATUS_LABELS, type JobStatusKey } from "./content";
import { computeEventoCusto, type ConsumoEventoRow } from "./custo-core";
import { agregarPeriodo, SELECT_EVENTOS_CUSTO } from "./custo-calculo";
import type { Ctx } from "./assistente.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const LIMITE = 50;
const semAcesso = (tela: string) => ({ sem_permissao: true, mensagem: `A tela ${tela} não está disponível para o seu usuário.` });
const perfilArg = z.string().nullable().describe("ID do perfil. Nulo = perfil selecionado no topo.");
const pid = (ctx: Ctx, v: string | null | undefined) => v || ctx.profileId;
const linkJob = (id: string) => `/app/pipeline?jobId=${id}`;
const st = (s: string | null | undefined) => (s ? JOB_STATUS_LABELS[s as JobStatusKey] ?? s : null);
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => reais(cents / 100);
const quando = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null;

async function nomes(db: Any, ids: Array<string | null>) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("app_users").select("id, name, email").in("id", u);
  return new Map<string, string>(((data ?? []) as Any[]).map((x) => [x.id, x.name || String(x.email).split("@")[0]]));
}
const quem = (m: Map<string, string>, id: string | null, vazio = "automação") => (id ? m.get(id) ?? "outro membro da equipe" : vazio);

async function precos(db: Any) {
  const [t, x, c] = await Promise.all([
    db.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo"),
    db.from("credito_taxas").select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo"),
    db.from("app_config").select("value_num").eq("key", "cotacao_usd_brl").maybeSingle(),
  ]);
  return {
    tarifas: ((t.data ?? []) as Any[]).map((r) => ({ ...r, preco_unitario: Number(r.preco_unitario) })),
    taxas: ((x.data ?? []) as Any[]).map((r) => ({ ...r, credito_por_unidade: Number(r.credito_por_unidade) })),
    cotacao: Number(c.data?.value_num ?? 1),
  };
}

const FORNECEDOR_DE = (etapa: string) =>
  etapa === "busca_kalodata" ? "kalodata" : etapa === "montagem_json2video" ? "json2video" : etapa === "narracao_elevenlabs" ? "elevenlabs" : "google";
const FORNECEDOR_NOME: Record<string, string> = { google: "Google (Gemini + Veo)", kalodata: "Kalodata", json2video: "JSON2Video", elevenlabs: "ElevenLabs" };

export function buildToolsExtra(ctx: Ctx) {
  const { db } = ctx;
  const podeCustos = (p: string | null) => ctx.access.isBackoffice || ctx.access.can("custos", "visualizar", p);

  return {
    buscas_recentes: tool({
      description: "Histórico de buscas do Descobrir e do Radar (Em ascensão): termo, filtros, data, quantos resultados, custo e quem fez. Até 20.",
      inputSchema: z.object({ profile_id: perfilArg, dias: z.number().nullable() }),
      execute: async ({ profile_id, dias }) => {
        const p = pid(ctx, profile_id);
        if (!ctx.access.can("produtos", "visualizar", p) && !ctx.access.isBackoffice) return semAcesso("Produtos");
        let q = db.from("buscas_produto").select("id, origem, termo, filtros, total, user_id, created_at, profile_id, consumo_evento_id").order("created_at", { ascending: false }).limit(20);
        if (p) q = q.eq("profile_id", p);
        if (dias) q = q.gte("created_at", new Date(Date.now() - dias * 86400_000).toISOString());
        const { data, error } = await q;
        if (error) return { erro: "Não consegui ler o histórico de buscas." };
        const rows = (data ?? []) as Any[];
        if (!rows.length) return { buscas: [], observacao: "Nenhuma busca registrada. O histórico começou a ser guardado nesta versão e fica 30 dias." };
        const m = await nomes(db, rows.map((r) => r.user_id));
        // Custo: linha da tela Custos (agregarPeriodo) do evento de consumo vinculado à busca.
        let custoPorBusca = new Map<string, string>();
        if (podeCustos(p)) {
          const evIds = rows.map((r) => r.consumo_evento_id).filter(Boolean);
          const [{ data: eventos }, pr] = await Promise.all([
            evIds.length ? db.from("consumo_eventos").select(SELECT_EVENTOS_CUSTO).in("id", evIds) : Promise.resolve({ data: [] }),
            precos(db),
          ]);
          const linhas = new Map(agregarPeriodo((eventos ?? []) as ConsumoEventoRow[], pr.tarifas, pr.cotacao, [], pr.taxas).buscas.map((l) => [l.id, l]));
          custoPorBusca = new Map(rows.map((r) => {
            const l = r.consumo_evento_id ? linhas.get(r.consumo_evento_id) : undefined;
            return [r.id, l ? reais(l.valorBrl) : "sem custo registrado"];
          }));
        }
        return rows.map((r) => ({
          id: r.id, origem: r.origem === "radar" ? "Em ascensão (Radar)" : "Descobrir", termo: r.termo || "(sem termo)",
          filtros: { periodo: r.filtros?.dateRange, ordenacao: r.filtros?.sortField, categorias: r.filtros?.categoryIds ?? null, comissao: r.filtros?.commissionRate ?? null, preco: r.filtros?.unitPriceRange ?? null },
          resultados: r.total, data: quando(r.created_at), quem_fez: quem(m, r.user_id, "sistema"),
          custo: podeCustos(p) ? custoPorBusca.get(r.id) : "sem permissão", link: "/app/produtos?tab=descobrir",
        }));
      },
    }),

    produtos_descobertos: tool({
      description: "Produtos retornados na última busca do Descobrir/Radar (ou de uma busca pelo id), com os mesmos campos da tabela do Descobrir, mesmo sem salvar no catálogo.",
      inputSchema: z.object({ profile_id: perfilArg, busca_id: z.string().nullable() }),
      execute: async ({ profile_id, busca_id }) => {
        const p = pid(ctx, profile_id);
        if (!ctx.access.can("produtos", "visualizar", p) && !ctx.access.isBackoffice) return semAcesso("Produtos");
        let q = db.from("buscas_produto").select("id, origem, termo, total, resultados, created_at").order("created_at", { ascending: false }).limit(1);
        if (busca_id) q = q.eq("id", busca_id);
        else if (p) q = q.eq("profile_id", p);
        const { data } = await q;
        const b = (data ?? [])[0] as Any;
        if (!b) return { erro: "Nenhuma busca guardada encontrada (o histórico começou nesta versão e fica 30 dias)." };
        const itens = ((b.resultados ?? []) as Any[]).slice(0, LIMITE).map((x) => ({
          nome: x.name, vendedor: x.sellerName, categoria: x.category || "Não informada", preco: reais(Number(x.price ?? 0)),
          comissao: `${Number(x.commission ?? 0)}% (${reais(Number(x.price ?? 0) * Number(x.commission ?? 0) / 100)} por venda)`,
          vendas: x.salesVolume, crescimento: `${Number(x.growthRate ?? 0)}%`, receita: reais(Number(x.revenue ?? 0)), hype: x.hype, link: x.productUrl,
        }));
        return { busca: { id: b.id, origem: b.origem === "radar" ? "Em ascensão (Radar)" : "Descobrir", termo: b.termo || "(sem termo)", data: quando(b.created_at), total: b.total }, produtos: itens, link: "/app/produtos?tab=descobrir" };
      },
    }),

    historico_job: tool({
      description: "Linha do tempo de um job: etapas e tempo em cada uma, avanços/voltas com quem fez, tentativas, erros anteriores, link público e aberturas.",
      inputSchema: z.object({ job_id: z.string() }),
      execute: async ({ job_id }) => {
        const [{ data: job }, etapas, eventos, shares] = await Promise.all([
          db.from("jobs").select("id, title").eq("id", job_id).maybeSingle(),
          db.from("job_stage_events").select("status, entered_at, exited_at").eq("job_id", job_id).order("entered_at"),
          db.from("job_eventos").select("tipo, de_status, para_status, mensagem, ator, created_at").eq("job_id", job_id).order("created_at").limit(LIMITE),
          db.from("job_shares").select("ativo, views, expires_at, created_at, created_by").eq("job_id", job_id),
        ]);
        if (!job) return { erro: "Não encontrei esse job." };
        const ev = (eventos.data ?? []) as Any[];
        const m = await nomes(db, [...ev.map((e) => e.ator), ...((shares.data ?? []) as Any[]).map((s) => s.created_by)]);
        return {
          titulo: job.title,
          etapas: ((etapas.data ?? []) as Any[]).map((e) => ({
            etapa: st(e.status), inicio: quando(e.entered_at), fim: quando(e.exited_at),
            minutos: e.exited_at ? Math.round((new Date(e.exited_at).getTime() - new Date(e.entered_at).getTime()) / 60000) : "em andamento",
          })),
          acoes: ev.map((e) => ({
            tipo: e.tipo === "avancou" ? "avançou" : e.tipo === "voltou" ? "voltou etapa" : e.tipo === "erro" ? "erro" : e.tipo === "tentativa" ? "tentativa" : "criado",
            de: st(e.de_status), para: st(e.para_status),
            detalhe: e.tipo === "erro" ? "A tentativa falhou." : e.mensagem, quem: quem(m, e.ator, "sistema"), data: quando(e.created_at),
          })),
          tentativas: ev.filter((e) => e.tipo === "tentativa").length,
          erros: ev.filter((e) => e.tipo === "erro").length,
          observacao_registro: "Ações, tentativas e erros são registrados a partir desta versão; jobs antigos mostram só as etapas.",
          links_publicos: ((shares.data ?? []) as Any[]).map((s) => ({ ativo: s.ativo, aberturas: s.views, criado_em: quando(s.created_at), criado_por: quem(m, s.created_by), expira_em: quando(s.expires_at) ?? "sem expiração" })),
          link: linkJob(job_id),
        };
      },
    }),

    versoes_gravacao: tool({
      description: "Versões de um vídeo próprio/gravado: original, editada e IA, com data e qual está marcada para postagem.",
      inputSchema: z.object({ job_id: z.string() }),
      execute: async ({ job_id }) => {
        const { data: j } = await db.from("jobs").select("id, title, formato, recorded_at, video_original_path, video_edited_path, video_edits, ai_video_path, ai_video_url, ai_status, video_choice, updated_at").eq("id", job_id).maybeSingle();
        if (!j) return { erro: "Não encontrei esse job." };
        const dur = (j.video_edits as Any)?.duration ?? (j.video_edits as Any)?.duracao ?? null;
        const versoes = [
          { versao: "Original gravada", existe: !!j.video_original_path, data: quando(j.recorded_at), duracao: null },
          { versao: "Editada", existe: !!j.video_edited_path, data: j.video_edited_path ? quando(j.updated_at) : null, duracao: dur ? `${Math.round(Number(dur))}s` : null },
          { versao: "Gerada por IA", existe: !!(j.ai_video_path || j.ai_video_url), data: null, duracao: null, estado: j.ai_status ?? null },
        ];
        return {
          titulo: j.title, versoes: versoes.map((v) => ({ ...v, duracao: v.duracao ?? "não registrada" })),
          marcada_para_postagem: j.video_choice === "ia" ? "Gerada por IA" : j.video_edited_path ? "Editada" : j.video_original_path ? "Original gravada" : "nenhuma",
          link: linkJob(job_id),
        };
      },
    }),

    avatares_e_vozes: tool({
      description: "Biblioteca de avatares/personas do perfil (nome, tag, nº de fotos) e vozes disponíveis (nome, fonte, clonada ou catálogo, qual é a padrão).",
      inputSchema: z.object({ profile_id: perfilArg }),
      execute: async ({ profile_id }) => {
        const p = pid(ctx, profile_id);
        if (!p) return { erro: "Selecione um perfil no topo." };
        const [av, vz, cfg] = await Promise.all([
          db.from("profile_avatars").select("name, tag, reference_urls, primary_url, description").eq("profile_id", p).order("name").limit(LIMITE),
          db.from("voices").select("id, nome, fonte, genero, profile_id").or(`profile_id.eq.${p},profile_id.is.null`).order("nome").limit(LIMITE),
          db.from("profile_video_settings").select("voice_ref, visual_style, avatar_mode").eq("profile_id", p).maybeSingle(),
        ]);
        const fonte = (f: string) => (f === "clonada" ? { fonte: "ElevenLabs", tipo: "clonada" } : f === "elevenlabs_catalogo" ? { fonte: "ElevenLabs", tipo: "catálogo" } : { fonte: "Azure", tipo: "catálogo" });
        return {
          estilo_visual_do_perfil: cfg.data?.visual_style ?? "realista", modo_pessoa: cfg.data?.avatar_mode ?? "não configurado",
          avatares: ((av.data ?? []) as Any[]).map((a) => ({ nome: a.name, tag: a.tag ? `{{${a.tag}}}` : null, fotos: Array.isArray(a.reference_urls) ? a.reference_urls.length : 0, tem_foto_principal: !!a.primary_url })),
          vozes: ((vz.data ?? []) as Any[]).map((v) => ({ nome: v.nome, ...fonte(v.fonte), genero: v.genero, padrao_do_perfil: v.id === cfg.data?.voice_ref })),
          link: `/app/perfis/${p}/editar?tab=avatares`,
        };
      },
    }),

    execucoes_automacao: tool({
      description: "Execuções da automação (todas, até 50), com produto escolhido, custo, resultado, motivo de pausa e filtros da agenda.",
      inputSchema: z.object({ profile_id: perfilArg, dias: z.number().nullable() }),
      execute: async ({ profile_id, dias }) => {
        const p = pid(ctx, profile_id);
        let sq = db.from("automation_schedules").select("id, nome, ativa, pausada_motivo, filtros, fonte, profiles(name)");
        if (p) sq = sq.eq("profile_id", p);
        const { data: ags } = await sq;
        const ids = ((ags ?? []) as Any[]).map((s) => s.id);
        if (!ids.length) return { execucoes: [], observacao: "Nenhuma agenda encontrada." };
        let rq = db.from("automation_runs").select("schedule_id, dia, horario, status, mensagem, custo_estimado_cents, job_id, created_at").in("schedule_id", ids).order("created_at", { ascending: false }).limit(LIMITE);
        if (dias) rq = rq.gte("created_at", new Date(Date.now() - dias * 86400_000).toISOString());
        const { data: runs } = await rq;
        const jobIds = ((runs ?? []) as Any[]).map((r) => r.job_id).filter(Boolean);
        const jobs = jobIds.length ? await db.from("jobs").select("id, title, products(name)").in("id", jobIds) : { data: [] };
        const jm = new Map(((jobs.data ?? []) as Any[]).map((j) => [j.id, j]));
        const am = new Map(((ags ?? []) as Any[]).map((s) => [s.id, s]));
        return {
          agendas: ((ags ?? []) as Any[]).map((s) => ({ nome: s.nome, perfil: s.profiles?.name, status: s.ativa ? "ativa" : "pausada", motivo_pausa: s.pausada_motivo, fonte_produtos: s.fonte, filtros: s.filtros })),
          execucoes: ((runs ?? []) as Any[]).map((r) => ({
            agenda: am.get(r.schedule_id)?.nome, dia: r.dia, horario: r.horario, resultado: r.status, mensagem: r.mensagem,
            produto: jm.get(r.job_id)?.products?.name ?? null, job: jm.get(r.job_id)?.title ?? null,
            custo_estimado: r.custo_estimado_cents != null ? brl(r.custo_estimado_cents) : null, link: r.job_id ? linkJob(r.job_id) : null,
          })),
          link: "/app/automacao",
        };
      },
    }),

    investimento: tool({
      description: "Carteiras por fornecedor (aportado, consumido, saldo em R$ e unidade), planos e alerta. Só para quem vê a tela Investimento.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!(ctx.access.isBackoffice || ctx.access.can("investimento", "visualizar", ctx.profileId))) return semAcesso("Investimento");
        if (!ctx.tenantId) return { erro: "Empresa não identificada." };
        const [ap, pl, cfg] = await Promise.all([
          db.from("fornecedor_aportes").select("fornecedor, data, valor_brl, unidades, unidade").eq("tenant_id", ctx.tenantId).order("data", { ascending: false }),
          db.from("fornecedor_planos").select("fornecedor, creditos_mes, valor_mensal, dia_renovacao, ativo").eq("tenant_id", ctx.tenantId),
          db.from("app_config").select("key, value_num").in("key", ["investimento_alerta_percent", "investimento_bloqueio"]),
        ]);
        const consumo = new Map<string, number>();
        if (ctx.access.isBackoffice) {
          const [{ data: ev }, pr] = await Promise.all([
            db.from("consumo_eventos").select(SELECT_EVENTOS_CUSTO).eq("tenant_id", ctx.tenantId).limit(20000),
            precos(db),
          ]);
          const seg = new Map<string, number>();
          for (const e of (ev ?? []) as Any[]) if (e.etapa === "animacao_veo" && e.job_id) seg.set(e.job_id, (seg.get(e.job_id) ?? 0) + (e.quantidade ?? 0));
          for (const e of (ev ?? []) as Any[]) {
            const c = computeEventoCusto(e, pr.tarifas as Any, pr.cotacao, e.job_id ? seg.get(e.job_id) ?? 0 : 0, pr.taxas as Any);
            const k = FORNECEDOR_DE(e.etapa);
            consumo.set(k, (consumo.get(k) ?? 0) + c.valorBrl);
          }
        }
        const alerta = Number(((cfg.data ?? []) as Any[]).find((c) => c.key === "investimento_alerta_percent")?.value_num ?? 20);
        return {
          carteiras: Object.keys(FORNECEDOR_NOME).map((k) => {
            const aps = ((ap.data ?? []) as Any[]).filter((a) => a.fornecedor === k);
            const aportado = aps.reduce((s, a) => s + Number(a.valor_brl ?? 0), 0);
            const usado = consumo.get(k);
            const plano = ((pl.data ?? []) as Any[]).find((p) => p.fornecedor === k);
            return {
              fornecedor: FORNECEDOR_NOME[k], aportado: reais(aportado),
              unidades_aportadas: aps.reduce((s, a) => s + Number(a.unidades ?? 0), 0) || null,
              consumido: usado != null ? reais(usado) : "ver na tela",
              saldo: usado != null ? reais(aportado - usado) : "ver na tela",
              ultimos_aportes: aps.slice(0, 5).map((a) => ({ data: a.data, valor: reais(Number(a.valor_brl)), unidades: a.unidades ? `${a.unidades} ${a.unidade ?? ""}`.trim() : null })),
              plano: plano ? { creditos_mes: plano.creditos_mes, valor_mensal: reais(Number(plano.valor_mensal)), dia_renovacao: plano.dia_renovacao, ativo: plano.ativo } : null,
            };
          }),
          alerta_saldo_baixo: `${alerta}%`,
          observacao: "A tela Investimento é a referência para saldos por ciclo e extrato detalhado.",
          link: "/app/investimento",
        };
      },
    }),

    equipe: tool({
      description: "Membros da empresa, papéis por perfil e cadastros pendentes. Só administradores.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.access.isAdmin) return semAcesso("Equipe");
        const [us, upr, roles, profs] = await Promise.all([
          db.from("app_users").select("id, name, email, status, created_at").order("created_at").limit(200),
          db.from("user_profile_roles").select("user_id, profile_id, role_id"),
          db.from("roles").select("id, name, is_admin"),
          db.from("profiles").select("id, name"),
        ]);
        const rn = new Map(((roles.data ?? []) as Any[]).map((r) => [r.id, r.name]));
        const pn = new Map(((profs.data ?? []) as Any[]).map((p) => [p.id, p.name]));
        const lista = ((us.data ?? []) as Any[]).map((u) => ({
          nome: u.name, email: u.email, status: u.status, desde: quando(u.created_at),
          papeis: ((upr.data ?? []) as Any[]).filter((a) => a.user_id === u.id).map((a) => ({ papel: rn.get(a.role_id) ?? "papel", perfil: a.profile_id ? pn.get(a.profile_id) ?? "perfil" : "todos os perfis" })),
        }));
        return { membros: lista.filter((u) => u.status === "aprovado").slice(0, LIMITE), pendentes: lista.filter((u) => u.status === "pendente"), outros: lista.filter((u) => !["aprovado", "pendente"].includes(u.status)).map((u) => ({ nome: u.nome, status: u.status })), link: "/app/equipe" };
      },
    }),

    integracoes: tool({
      description: "Status da conexão TikTok de cada perfil (conectado, erro, desconectado), data e expiração do acesso.",
      inputSchema: z.object({ profile_id: perfilArg }),
      execute: async ({ profile_id }) => {
        const p = pid(ctx, profile_id);
        let q = db.from("tiktok_connections").select("profile_id, status, seller_name, updated_at, access_token_expires_at, refresh_token_expires_at, last_error, profiles(name)").limit(LIMITE);
        if (p) q = q.eq("profile_id", p);
        const { data, error } = await q;
        if (error) return { erro: "Não consegui ler as integrações (talvez sem permissão)." };
        const rows = (data ?? []) as Any[];
        if (!rows.length) return { conexoes: [], observacao: "Nenhum perfil conectado ao TikTok.", link: p ? `/app/perfis/${p}/editar?tab=integracoes` : "/app/perfis" };
        return rows.map((r) => ({
          perfil: r.profiles?.name, status: r.last_error && r.status !== "connected" ? "erro" : r.status === "connected" ? "conectado" : r.status,
          conta: r.seller_name, atualizado_em: quando(r.updated_at), acesso_expira_em: quando(r.access_token_expires_at), renovacao_expira_em: quando(r.refresh_token_expires_at),
          link: `/app/perfis/${r.profile_id}/editar?tab=integracoes`,
        }));
      },
    }),

    empresas_planos: tool({
      description: "Só backoffice: empresas (plano, cadastro, saldos) e catálogo de planos com pacotes por ação.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.access.isBackoffice) return semAcesso("Empresas e Planos");
        const [tn, pl, pp, bal, ba] = await Promise.all([
          db.from("tenants").select("id, name, plan_id, created_at").order("name").limit(LIMITE),
          db.from("plans").select("id, name, billing_model, price_cents, is_active"),
          db.from("plan_action_prices").select("plan_id, action_type, package_qty, package_price_cents"),
          db.from("tenant_action_balances").select("tenant_id, action_type, saldo"),
          db.from("billable_actions").select("action_type, label"),
        ]);
        const lbl = new Map(((ba.data ?? []) as Any[]).map((b) => [b.action_type, b.label]));
        const planos = (pl.data ?? []) as Any[];
        return {
          empresas: ((tn.data ?? []) as Any[]).map((t) => ({
            nome: t.name, plano: planos.find((p) => p.id === t.plan_id)?.name ?? "sem plano", desde: quando(t.created_at),
            saldos: ((bal.data ?? []) as Any[]).filter((b) => b.tenant_id === t.id).map((b) => ({ acao: lbl.get(b.action_type) ?? b.action_type, saldo: b.saldo })),
          })),
          planos: planos.map((p) => ({
            nome: p.name, ativo: p.is_active, modelo: p.billing_model, preco: brl(p.price_cents ?? 0),
            pacotes: ((pp.data ?? []) as Any[]).filter((x) => x.plan_id === p.id).map((x) => ({ acao: lbl.get(x.action_type) ?? x.action_type, quantidade: x.package_qty, preco: Number(x.package_price_cents) > 0 ? brl(x.package_price_cents) : "ilimitado (preço zero)" })),
          })),
          link: "/app/empresas",
        };
      },
    }),

    config_perfil: tool({
      description: "Identidade e configuração do perfil: tom, idioma, observações, geração, estilo visual, formato de gravação, fluxo de publicação e quais prompts têm personalização (sem o conteúdo).",
      inputSchema: z.object({ profile_id: perfilArg }),
      execute: async ({ profile_id }) => {
        const p = pid(ctx, profile_id);
        if (!p) return { erro: "Selecione um perfil no topo." };
        const [pr, idt, cfg, ov] = await Promise.all([
          db.from("profiles").select("name, handle, niche, status").eq("id", p).maybeSingle(),
          db.from("profile_identities").select("tone, language, style_notes").eq("profile_id", p).maybeSingle(),
          db.from("profile_video_settings").select("avatar_mode, takes_count, take_duration, visual_style, visual_style_custom, recording_aspect_ratio, require_review, voice_ref").eq("profile_id", p).maybeSingle(),
          db.from("profile_prompt_overrides").select("key, origem, updated_at").eq("profile_id", p),
        ]);
        if (!pr.data) return { erro: "Perfil não encontrado." };
        const c = cfg.data as Any;
        return {
          perfil: pr.data.name, arroba: pr.data.handle, categoria: pr.data.niche, status: pr.data.status,
          identidade: idt.data ? { tom: idt.data.tone, idioma: idt.data.language, observacoes: idt.data.style_notes || null } : "não configurada",
          geracao: c ? { modo_pessoa: c.avatar_mode, cenas: c.takes_count, duracao_take: `${c.take_duration}s`, estilo_visual: c.visual_style === "custom" ? c.visual_style_custom : c.visual_style, voz_configurada: !!c.voice_ref } : "não configurada",
          formato_gravacao: c?.recording_aspect_ratio ?? "9:16",
          fluxo_publicacao: c?.require_review === false ? "sem revisão obrigatória" : "revisão antes de postar",
          prompts_personalizados: ((ov.data ?? []) as Any[]).map((o) => ({ prompt: o.key, origem: o.origem, atualizado_em: quando(o.updated_at) })),
          observacao_prompts: "O conteúdo dos prompts não é exibido pelo assistente.",
          link: `/app/perfis/${p}/editar`,
        };
      },
    }),

    notificacoes: tool({
      description: "Últimas notificações de conclusão de etapa do usuário (roteiro pronto, cenas geradas, vídeo pronto).",
      inputSchema: z.object({ so_nao_lidas: z.boolean().nullable() }),
      execute: async ({ so_nao_lidas }) => {
        let q = db.from("notificacoes").select("tipo, texto, lida, job_id, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(20);
        if (so_nao_lidas) q = q.eq("lida", false);
        const { data } = await q;
        const rows = (data ?? []) as Any[];
        if (!rows.length) return { notificacoes: [], observacao: "Nenhuma notificação. O registro começou nesta versão." };
        return rows.map((n) => ({ texto: n.texto, lida: n.lida, data: quando(n.created_at), link: n.job_id ? linkJob(n.job_id) : null }));
      },
    }),

    lixeira: tool({
      description: "Jobs na lixeira do perfil.",
      inputSchema: z.object({ profile_id: perfilArg }),
      execute: async ({ profile_id }) => {
        const p = pid(ctx, profile_id);
        let q = db.from("jobs").select("id, title, deleted_at, deleted_from_status, products(name)").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(LIMITE);
        if (p) q = q.eq("profile_id", p);
        const { data, error } = await q;
        if (error) return { erro: "Não consegui ler a lixeira." };
        return { total: (data ?? []).length, jobs: ((data ?? []) as Any[]).map((j) => ({ titulo: j.title, produto: j.products?.name ?? null, excluido_em: quando(j.deleted_at), estava_em: st(j.deleted_from_status) })), link: "/app/rascunhos?tab=lixeira" };
      },
    }),

    metricas: tool({
      description: "Métricas de desempenho (views, vendas, comissão).",
      inputSchema: z.object({}),
      execute: async () => ({ mensagem: "Métricas ainda não disponíveis nesta versão.", link: "/app/metricas" }),
    }),

    configuracoes_sistema: tool({
      description: "Só backoffice: Configurações do sistema (fonte de dados, tarifas de custo, orçamento). Sem prompts.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.access.isBackoffice) return semAcesso("Configurações");
        const [cfg, t, x] = await Promise.all([
          db.from("app_config").select("key, value_num, value_text, updated_at"),
          db.from("tarifas").select("tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo").eq("ativo", true),
          db.from("credito_taxas").select("action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo").eq("ativo", true),
        ]);
        return {
          parametros: ((cfg.data ?? []) as Any[]).map((c) => ({ chave: c.key, valor: c.value_text ?? c.value_num, atualizado_em: quando(c.updated_at) })),
          tarifas: ((t.data ?? []) as Any[]).map((r) => ({ modelo: r.modelo, unidade: r.tipo_unidade, preco: `${r.moeda} ${Number(r.preco_unitario)}`, desde: r.vigente_desde })),
          taxas_credito: ((x.data ?? []) as Any[]).map((r) => ({ acao: r.action_type, fornecedor: r.fornecedor, credito_por_unidade: Number(r.credito_por_unidade), regra: r.regra })),
          link: "/app/configuracoes",
        };
      },
    }),

    minhas_apis: tool({
      description: "Chaves de API da empresa: provedor, se está configurada, status e último teste. Nunca o valor.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.access.isAdmin) return semAcesso("Minhas APIs");
        const { data } = await db.from("tenant_api_keys").select("provider, status, last_tested_at, last_test_ok");
        const rows = (data ?? []) as Any[];
        return {
          chaves: ["gemini", "json2video", "elevenlabs", "kalodata"].map((prov) => {
            const r = rows.find((x) => x.provider === prov);
            return { provedor: prov, configurada: !!r, status: r?.status ?? "não configurada", ultimo_teste: quando(r?.last_tested_at), teste_ok: r?.last_test_ok ?? null };
          }),
          link: "/app/apis",
        };
      },
    }),

    progresso_guia: tool({
      description: "Progresso do Guia do Shop Studio: passos concluídos e os que faltam.",
      inputSchema: z.object({}),
      execute: async () => {
        const AFTER_ROTEIRO = ["roteiro_pronto", "gerando_cenas", "cenas_geradas", "gerando_video", "video_pronto", "rascunho_enviado", "publicado"];
        const AFTER_CENAS = ["cenas_geradas", "gerando_video", "video_pronto", "rascunho_enviado", "publicado"];
        const head = { count: "exact" as const, head: true };
        const has = async (q: Any) => ((await q).count ?? 0) > 0;
        const r = await Promise.all([
          has(db.from("profiles").select("id", head)),
          has(db.from("profile_video_settings").select("profile_id", head).or("avatar_mode.not.is.null,voice_ref.not.is.null")),
          has(db.from("products").select("id", head)),
          has(db.from("jobs").select("id", head).in("status", AFTER_ROTEIRO)),
          has(db.from("jobs").select("id", head).in("status", AFTER_ROTEIRO)),
          has(db.from("jobs").select("id", head).in("status", AFTER_CENAS)),
          has(db.from("jobs").select("id", head).not("recorded_at", "is", null)),
          has(db.from("jobs").select("id", head).not("approved_at", "is", null)),
          has(db.from("jobs").select("id", head).eq("status", "publicado")),
          has(db.from("automation_schedules").select("id", head)),
        ]);
        const nomesPassos = ["Crie seu perfil", "Escolha quem aparece nos vídeos", "Garimpe produtos em alta", "Escolha o formato do vídeo", "Revise o roteiro", "Aprove as cenas antes do vídeo", "Ou grave no estúdio", "Revise e aprove", "Poste com o kit de postagem", "Deixe rodar sozinho"];
        return { concluidos: r.filter(Boolean).length, total: nomesPassos.length, feitos: nomesPassos.filter((_, i) => r[i]), faltam: nomesPassos.filter((_, i) => !r[i]), onde_abrir: "Menu da sua foto > Guia do Shop Studio, ou o botão Como funciona na Visão geral." };
      },
    }),
  };
}

export const TOOL_LABELS_EXTRA: Record<string, string> = {
  buscas_recentes: "Consultando buscas...",
  produtos_descobertos: "Consultando produtos descobertos...",
  historico_job: "Consultando histórico do job...",
  versoes_gravacao: "Consultando versões do vídeo...",
  avatares_e_vozes: "Consultando avatares e vozes...",
  execucoes_automacao: "Consultando execuções...",
  investimento: "Consultando investimento...",
  equipe: "Consultando equipe...",
  integracoes: "Consultando integrações...",
  empresas_planos: "Consultando empresas e planos...",
  config_perfil: "Consultando configuração do perfil...",
  notificacoes: "Consultando notificações...",
  lixeira: "Consultando lixeira...",
  metricas: "Consultando métricas...",
  configuracoes_sistema: "Consultando configurações...",
  minhas_apis: "Consultando APIs...",
  progresso_guia: "Consultando o guia...",
};
