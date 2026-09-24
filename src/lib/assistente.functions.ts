import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(40),
  profileId: z.string().uuid().nullable(),
  rota: z.string().max(200).nullable(),
});

/** Etapa A: só backoffice testa. Toda a execução (IA + consultas) acontece no servidor. */
export const perguntarAssistente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { loadAccess, runAssistente, registrarUso, RATE_MAX, RATE_JANELA_MIN } = await import("./assistente.server");
    const db = context.supabase as never;
    const email = (context.claims as { email?: string } | undefined)?.email;
    const access = await loadAccess(db, context.userId, email);
    if (!access.isBackoffice) return { ok: false as const, erro: "O assistente ainda está em teste e só está disponível para o backoffice." };

    // Rate limit por usuário, no servidor.
    const desde = new Date(Date.now() - RATE_JANELA_MIN * 60_000).toISOString();
    const { count } = await context.supabase.from("assistente_uso").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", desde);
    if ((count ?? 0) >= RATE_MAX) return { ok: false as const, erro: `Você enviou muitas mensagens. Aguarde alguns minutos (limite de ${RATE_MAX} a cada ${RATE_JANELA_MIN} minutos).` };
    await context.supabase.from("assistente_uso").insert({ user_id: context.userId, tenant_id: access.tenantId });

    const ctx = { db, userId: context.userId, profileId: data.profileId, tenantId: access.tenantId, access };
    try {
      const r = await runAssistente(ctx, data.messages, data.rota);
      await registrarUso(ctx, r.uso);
      return { ok: true as const, texto: r.texto || "Não consegui montar uma resposta. Tente perguntar de outro jeito.", ferramentas: r.ferramentas };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("[assistente] falha", e);
      if (status === 429) return { ok: false as const, erro: "Muitas perguntas ao mesmo tempo. Tente de novo em instantes." };
      if (status === 402) return { ok: false as const, erro: "Os créditos de IA da plataforma acabaram. Avise o administrador." };
      return { ok: false as const, erro: "O assistente não conseguiu responder agora. Tente novamente." };
    }
  });
