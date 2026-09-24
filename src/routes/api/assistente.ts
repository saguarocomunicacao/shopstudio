import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const Body = z.object({
  conversaId: z.string().uuid().nullable(),
  pergunta: z.string().trim().min(1).max(4000),
  profileId: z.string().uuid().nullable(),
  rota: z.string().max(200).nullable(),
  reenviar: z.boolean().optional(),
});

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Assistente em streaming (NDJSON). IA e consultas rodam só aqui, com o JWT do usuário (RLS).
 * Eventos: {t:"conversa",id} {t:"tool",nome} {t:"delta",x} {t:"fim",id} {t:"erro",msg} {t:"limite",segundos}
 */
export const Route = createFileRoute("/api/assistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });
        const db = userClient(token);
        const { data: cl, error: clErr } = await db.auth.getClaims(token);
        if (clErr || !cl?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = cl.claims.sub as string;
        const email = (cl.claims as { email?: string }).email;

        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return Response.json({ erro: "Pergunta inválida." }, { status: 400 }); }

        const { loadAccess, runAssistente, registrarUso, RATE_MAX, RATE_JANELA_MIN } = await import("@/lib/assistente.server");
        const access = await loadAccess(db as never, userId, email);
        if (!access.approved) return new Response("Forbidden", { status: 403 });

        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* fechado */ } };
            try {
              // Rate limit no servidor.
              const desde = new Date(Date.now() - RATE_JANELA_MIN * 60_000).toISOString();
              const { data: usos } = await db.from("assistente_uso").select("created_at").eq("user_id", userId).gte("created_at", desde).order("created_at", { ascending: true });
              if ((usos?.length ?? 0) >= RATE_MAX) {
                const primeiro = new Date(usos![0].created_at).getTime();
                send({ t: "limite", segundos: Math.max(1, Math.ceil((primeiro + RATE_JANELA_MIN * 60_000 - Date.now()) / 1000)) });
                return;
              }

              // Conversa.
              let conversaId = body.conversaId;
              if (conversaId) {
                const { data } = await db.from("assistente_conversas").select("id").eq("id", conversaId).maybeSingle();
                if (!data) conversaId = null;
              }
              if (!conversaId) {
                const titulo = body.pergunta.replace(/\s+/g, " ").slice(0, 60);
                const { data, error } = await db.from("assistente_conversas").insert({ user_id: userId, tenant_id: access.tenantId, titulo }).select("id").single();
                if (error || !data) throw new Error("falha ao criar conversa: " + error?.message);
                conversaId = data.id;
              }
              send({ t: "conversa", id: conversaId });
              if (!body.reenviar) {
                const { error } = await db.from("assistente_mensagens").insert({ conversa_id: conversaId, papel: "user", conteudo: body.pergunta });
                if (error) console.error("[assistente] falha ao salvar pergunta", error.message);
              }
              await db.from("assistente_uso").insert({ user_id: userId, tenant_id: access.tenantId });

              const { data: hist } = await db.from("assistente_mensagens").select("papel, conteudo").eq("conversa_id", conversaId).in("papel", ["user", "assistant"]).order("criado_em", { ascending: false }).limit(20);
              const msgs = (hist ?? []).reverse().map((m) => ({ role: m.papel as "user" | "assistant", content: m.conteudo }));
              if (!msgs.length || msgs[msgs.length - 1].role !== "user") msgs.push({ role: "user", content: body.pergunta });

              const ctx = { db: db as never, userId, profileId: body.profileId, tenantId: access.tenantId, access };
              const r = await runAssistente(ctx, msgs, body.rota, {
                signal: request.signal,
                onTool: (nome) => send({ t: "tool", nome }),
                onDelta: (x) => send({ t: "delta", x }),
              });
              await registrarUso(ctx, r.uso);
              const texto = r.texto || "Não consegui montar uma resposta. Tente perguntar de outro jeito.";
              const { data: msg, error: mErr } = await db.from("assistente_mensagens").insert({ conversa_id: conversaId, papel: "assistant", conteudo: texto, tools_log: JSON.parse(JSON.stringify(r.consultas)) }).select("id").single();
              if (mErr) console.error("[assistente] falha ao salvar resposta", mErr.message);
              await db.from("assistente_conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);
              await db.from("assistente_consultas").insert({ user_id: userId, tenant_id: access.tenantId, profile_id: body.profileId, pergunta: body.pergunta, resposta: texto, consultas: r.consultas as never });
              send({ t: "fim", id: msg?.id ?? null, texto, consultas: r.consultas });
            } catch (e) {
              if (request.signal.aborted) return;
              const status = (e as { statusCode?: number }).statusCode;
              console.error("[assistente] falha", e);
              send({ t: "erro", msg: status === 402 ? "Os créditos de IA da plataforma acabaram. Avise o administrador." : "Não consegui responder agora." });
            } finally {
              try { controller.close(); } catch { /* já fechado */ }
            }
          },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
      },
    },
  },
});
