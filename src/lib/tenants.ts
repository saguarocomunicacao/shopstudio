/**
 * Clientes (tenants) visíveis para quem está logado.
 * A RLS já limita: o cliente comum enxerga só o próprio, o super admin todos.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TenantRow = { id: string; name: string };

export function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map((t) => ({ id: t.id, name: t.name || "Sem nome" })) as TenantRow[];
    },
  });
}

/** Tenant do usuário logado (usado como seleção padrão do backoffice). */
export function useMeuTenantId(userId: string | null) {
  return useQuery({
    queryKey: ["meu-tenant", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_users")
        .select("tenant_id")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.tenant_id ?? null) as string | null;
    },
  });
}
