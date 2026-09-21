import { recordConsumo } from "@/lib/consumo.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const { data: profile } = await supabaseAdmin.from("profiles").select("id, tenant_id").eq("slug", "teste-franquia").single();
if (!profile) throw new Error("perfil de teste nao encontrado");

for (let i = 0; i < 3; i++) {
  await recordConsumo({
    profileId: profile.id,
    etapa: "cena_gemini",
    acao: "cena",
    modelo: "teste-modelo",
    quantidade: 1,
    unidade: "imagem",
    metadados: { teste: true, ordem: i + 1 },
  });
}

const { data } = await supabaseAdmin
  .from("consumo_eventos")
  .select("created_at, action_type, tool_price_cents, billing_mode, metadados")
  .eq("tenant_id", profile.tenant_id)
  .order("created_at");
console.log(JSON.stringify(data, null, 2));
