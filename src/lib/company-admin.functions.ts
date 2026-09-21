import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendCompanyPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    userId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("is_backoffice");
    if (accessError || allowed !== true) throw new Error("Acesso negado.");

    const { data: account, error: accountError } = await context.supabase
      .from("app_users")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account?.email) throw new Error("Conta não encontrada.");

    const { error } = await context.supabase.auth.resetPasswordForEmail(account.email, {
      redirectTo: "https://shopstudio.com.br/redefinir-senha",
    });
    if (error) throw new Error("Não foi possível enviar o e-mail de redefinição.");
    return { ok: true };
  });