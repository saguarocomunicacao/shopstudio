import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const MODULES = ["perfis", "produtos", "pipeline", "videos", "rascunhos", "metricas", "custos", "investimento", "equipe", "configuracoes", "backoffice"] as const;
export const ACTIONS = ["visualizar", "criar", "editar", "remover", "publicar", "aprovar", "ver_global"] as const;
export type ModuleKey = (typeof MODULES)[number];
export type ActionKey = (typeof ACTIONS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  perfis: "Perfis", produtos: "Produtos", pipeline: "Pipeline", videos: "Vídeos",
  rascunhos: "Rascunhos", metricas: "Métricas", custos: "Custos", investimento: "Investimento", equipe: "Equipe", configuracoes: "Configurações",
  backoffice: "Backoffice (dados internos da operação)",
};
export const ACTION_LABELS: Record<ActionKey, string> = {
  visualizar: "Visualizar", criar: "Criar", editar: "Editar", remover: "Remover", publicar: "Publicar", aprovar: "Aprovar", ver_global: "Ver global",
};

export type DbProfile = { id: string; slug: string; name: string; niche: string; initials: string; followers: number; status: string; handle: string; created_by: string | null; category_id: string | null };
export type Role = { id: string; name: string; description: string; is_system: boolean; is_admin: boolean };
export type Permission = { id: string; module: string; action: string };
export type RolePermission = { role_id: string; permission_id: string };
export type Assignment = { id: string; user_id: string; profile_id: string | null; role_id: string };
export type AppUser = { id: string; email: string; name: string; avatar_url: string | null; status: string; created_at: string };

/** Dono do backoffice: sempre tem acesso total e nunca pode ser bloqueado. */
export const SUPER_ADMIN_EMAIL = "saguaro.comunicacao@gmail.com";
export type Invite = { id: string; email: string; created_at: string };

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, userId: session?.user.id ?? null, email: session?.user.email ?? null };
}

async function fetchAccess(userId: string) {
  await supabase.rpc("ensure_app_user");
  const [profilesRes, rolesRes, permsRes, rolePermsRes, mineRes, meRes] = await Promise.all([
    supabase.from("profiles").select("*").order("name"),
    supabase.from("roles").select("*").order("name"),
    supabase.from("permissions").select("*"),
    supabase.from("role_permissions").select("*"),
    supabase.from("user_profile_roles").select("*").eq("user_id", userId),
    supabase.from("app_users").select("*").eq("id", userId).maybeSingle(),
  ]);

  const me = (meRes.data ?? null) as AppUser | null;
  const isSuperAdmin = (me?.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;
  const roles = (rolesRes.data ?? []) as Role[];
  const assignments = (mineRes.data ?? []) as Assignment[];
  const adminRoleIds = new Set(roles.filter((r) => r.is_admin).map((r) => r.id));

  // Backoffice: super admin fixo ou quem recebeu explicitamente a permissao "backoffice".
  // Admin comum NAO entra aqui — espelha exatamente a regra do banco.
  const permissions = (permsRes.data ?? []) as Permission[];
  const rolePermissions = (rolePermsRes.data ?? []) as RolePermission[];
  const backofficePermIds = new Set(permissions.filter((p) => p.module === "backoffice").map((p) => p.id));
  const backofficeRoleIds = new Set(
    rolePermissions.filter((rp) => backofficePermIds.has(rp.permission_id)).map((rp) => rp.role_id),
  );
  const approved = isSuperAdmin || (me?.status ?? "pendente") === "aprovado";

  return {
    isBackoffice: isSuperAdmin || (approved && assignments.some((a) => backofficeRoleIds.has(a.role_id))),
    profiles: (profilesRes.data ?? []) as DbProfile[],
    roles,
    permissions,
    rolePermissions,
    assignments,
    me,
    isSuperAdmin,
    approvalStatus: isSuperAdmin ? "aprovado" : (me?.status ?? "pendente"),
    isAdmin: isSuperAdmin || assignments.some((a) => adminRoleIds.has(a.role_id)),
  };
}

export type AccessData = Awaited<ReturnType<typeof fetchAccess>>;

export function useAccess(userId: string | null) {
  return useQuery({
    queryKey: ["access", userId],
    queryFn: () => fetchAccess(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function buildCan(access: AccessData | undefined) {
  if (!access) return () => false;
  const permById = new Map(access.permissions.map((p) => [p.id, p]));
  const byRole = new Map<string, Set<string>>();
  for (const rp of access.rolePermissions) {
    const perm = permById.get(rp.permission_id);
    if (!perm) continue;
    if (!byRole.has(rp.role_id)) byRole.set(rp.role_id, new Set());
    byRole.get(rp.role_id)!.add(`${perm.module}:${perm.action}`);
  }
  return (module: ModuleKey, action: ActionKey, profileId?: string | null) => {
    if (access.approvalStatus !== "aprovado") return false;
    if (access.isAdmin) return true;
    const key = `${module}:${action}`;
    const relevant = profileId && profileId !== "all"
      ? access.assignments.filter((a) => a.profile_id === profileId)
      : access.assignments;
    return relevant.some((a) => byRole.get(a.role_id)?.has(key));
  };
}

export function useInvalidateAccess() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["access"] });
    qc.invalidateQueries({ queryKey: ["team"] });
  };
}
