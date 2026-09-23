import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { ACTIONS, ACTION_LABELS, MODULES, MODULE_LABELS, type ActionKey, type AppUser, type Assignment, type Invite, type ModuleKey, type Permission, type Role, type RolePermission } from "@/lib/access";
import { userErrorMessage } from "@/lib/user-error";
import { useStudio } from "./studio-context";

const NONE = "none";

async function fetchTeam() {
  const [users, roles, permissions, rolePermissions, assignments, invites] = await Promise.all([
    supabase.from("app_users").select("*").order("created_at"),
    supabase.from("roles").select("*").order("is_admin", { ascending: false }).order("name"),
    supabase.from("permissions").select("*"),
    supabase.from("role_permissions").select("*"),
    supabase.from("user_profile_roles").select("*"),
    supabase.from("user_invites").select("*").order("created_at"),
  ]);
  return {
    users: (users.data ?? []) as AppUser[],
    roles: (roles.data ?? []) as Role[],
    permissions: (permissions.data ?? []) as Permission[],
    rolePermissions: (rolePermissions.data ?? []) as RolePermission[],
    assignments: (assignments.data ?? []) as Assignment[],
    invites: (invites.data ?? []) as Invite[],
  };
}

const errMessage = (error: unknown) => {
  console.error("[team]", error);
  return userErrorMessage(error, "Não foi possível concluir a ação. Tente novamente.");
};

export function TeamPage() {
  const { profiles, isAdmin } = useStudio();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: fetchTeam, enabled: isAdmin });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["team"] }); qc.invalidateQueries({ queryKey: ["access"] }); };

  const [inviteEmail, setInviteEmail] = useState("");
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });

  const assign = useMutation({
    mutationFn: async ({ userId, profileId, roleId }: { userId: string; profileId: string | null; roleId: string | null }) => {
      const existing = (data?.assignments ?? []).find((a) => a.user_id === userId && a.profile_id === profileId);
      if (!roleId) {
        if (!existing) return;
        const { error } = await supabase.from("user_profile_roles").delete().eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
      }
      if (existing) {
        const { error } = await supabase.from("user_profile_roles").update({ role_id: roleId }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("user_profile_roles").insert({ user_id: userId, profile_id: profileId, role_id: roleId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Acesso atualizado."); refresh(); },
    onError: (error) => toast.error(errMessage(error)),
  });

  const invite = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from("user_invites").insert({ email: email.trim().toLowerCase() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Convite registrado. Peça para a pessoa criar a conta com esse email."); setInviteEmail(""); refresh(); },
    onError: (error) => toast.error(errMessage(error)),
  });

  const removeInvite = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("user_invites").delete().eq("id", id); if (error) throw new Error(error.message); },
    onSuccess: refresh,
    onError: (error) => toast.error(errMessage(error)),
  });

  const deleteRole = useMutation({
    mutationFn: async (role: Role) => {
      const inUse = (data?.assignments ?? []).filter((a) => a.role_id === role.id);
      if (inUse.length) {
        const names = inUse.map((a) => data?.users.find((u) => u.id === a.user_id)?.name || "usuário").filter((v, i, arr) => arr.indexOf(v) === i);
        throw new Error(`Este papel está em uso por: ${names.join(", ")}. Realoque essas pessoas antes de remover.`);
      }
      const { error } = await supabase.from("roles").delete().eq("id", role.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Papel removido."); refresh(); },
    onError: (error) => toast.error(errMessage(error)),
  });

  if (!isAdmin) return <div className="panel text-sm text-muted-foreground">Apenas administradores podem gerenciar a equipe.</div>;
  if (isLoading || !data) return <div className="panel text-sm text-muted-foreground">Carregando equipe...</div>;

  const adminRole = data.roles.find((r) => r.is_admin);
  const assignableRoles = data.roles.filter((r) => !r.is_admin);
  const isGlobalAdmin = (userId: string) => data.assignments.some((a) => a.user_id === userId && a.profile_id === null && a.role_id === adminRole?.id);
  const roleFor = (userId: string, profileId: string) => data.assignments.find((a) => a.user_id === userId && a.profile_id === profileId)?.role_id ?? NONE;

  return (
    <>
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase text-primary">Administração</p>
          <h1 className="truncate text-2xl font-black sm:text-3xl">Equipe e permissões</h1>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><UserPlus />Adicionar usuário</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar usuário</DialogTitle></DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="invite">Email</Label>
              <Input id="invite" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="pessoa@empresa.com" />
              <p className="text-xs text-muted-foreground">O cadastro está aberto: a pessoa cria a conta com este email e você libera os perfis aqui.</p>
            </div>
            <DialogFooter><Button disabled={!inviteEmail || invite.isPending} onClick={() => invite.mutate(inviteEmail)}>Registrar convite</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="panel overflow-x-auto">
        <h2 className="mb-4 font-bold">Acesso por perfil</h2>
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="pb-4 text-left">Usuário</th>
              <th className="pb-4 text-center text-xs font-medium text-muted-foreground">Admin</th>
              {profiles.map((p) => <th key={p.id} className="pb-4 text-center text-xs font-medium text-muted-foreground">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const admin = isGlobalAdmin(u.id);
              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{(u.name || u.email).slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0"><b className="block truncate">{u.name || "Sem nome"}</b><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <Switch aria-label={`Administrador: ${u.name}`} checked={admin}
                      onCheckedChange={(next) => assign.mutate({ userId: u.id, profileId: null, roleId: next ? adminRole?.id ?? null : null })} />
                  </td>
                  {profiles.map((p) => (
                    <td key={p.id} className="px-1 py-4">
                      {admin ? (
                        <p className="text-center text-xs font-semibold text-primary">Total</p>
                      ) : (
                        <Select value={roleFor(u.id, p.id)} onValueChange={(value) => assign.mutate({ userId: u.id, profileId: p.id, roleId: value === NONE ? null : value })}>
                          <SelectTrigger className="mx-auto w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sem acesso</SelectItem>
                            {assignableRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.users.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>}
      </section>

      {!!data.invites.length && (
        <section className="panel mt-4">
          <h2 className="mb-4 font-bold">Convites pendentes</h2>
          <div className="divide-y divide-border">
            {data.invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-3">
                <p className="text-sm">{i.email}</p>
                <Button variant="ghost" size="sm" onClick={() => removeInvite.mutate(i.id)}><Trash2 />Remover</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel mt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-bold">Papéis</h2><p className="text-xs text-muted-foreground">Defina o que cada papel pode fazer em cada módulo.</p></div>
          <Button variant="secondary" onClick={() => setRoleDialog({ open: true, role: null })}><Plus />Novo papel</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.roles.map((role) => {
            const count = data.rolePermissions.filter((rp) => rp.role_id === role.id).length;
            return (
              <article key={role.id} className="rounded-xl border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <b>{role.name}</b>
                  {role.is_admin && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold"><Lock className="h-3 w-3" />Travado</span>}
                  {role.is_system && !role.is_admin && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">Sistema</span>}
                </div>
                <p className="min-h-10 text-xs text-muted-foreground">{role.description}</p>
                <p className="mt-3 text-xs font-semibold">{count} permissões</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" disabled={role.is_admin} onClick={() => setRoleDialog({ open: true, role })}>Editar</Button>
                  <Button variant="ghost" size="sm" disabled={role.is_admin || deleteRole.isPending} onClick={() => deleteRole.mutate(role)}>Remover</Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <RoleDialog key={roleDialog.role?.id ?? "new"} open={roleDialog.open} role={roleDialog.role}
        permissions={data.permissions} rolePermissions={data.rolePermissions}
        onClose={() => setRoleDialog({ open: false, role: null })} onSaved={refresh} />
    </>
  );
}

function RoleDialog({ open, role, permissions, rolePermissions, onClose, onSaved }: {
  open: boolean; role: Role | null; permissions: Permission[]; rolePermissions: RolePermission[];
  onClose: () => void; onSaved: () => void;
}) {
  const permId = (module: ModuleKey, action: ActionKey) => permissions.find((p) => p.module === module && p.action === action)?.id;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role ? rolePermissions.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id) : []),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id?: string) => {
    if (!id) return;
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Informe o nome do papel."); return; }
    setSaving(true);
    try {
      let roleId = role?.id;
      if (role) {
        const { error } = await supabase.from("roles").update({ name: name.trim(), description }).eq("id", role.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("roles").insert({ name: name.trim(), description, is_system: false, is_admin: false }).select("id").single();
        if (error) throw new Error(error.message);
        roleId = data.id;
      }
      const { error: delError } = await supabase.from("role_permissions").delete().eq("role_id", roleId!);
      if (delError) throw new Error(delError.message);
      if (selected.size) {
        const { error: insError } = await supabase.from("role_permissions").insert([...selected].map((permission_id) => ({ role_id: roleId!, permission_id })));
        if (insError) throw new Error(insError.message);
      }
      toast.success(role ? "Papel atualizado." : "Papel criado.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{role ? `Editar ${role.name}` : "Novo papel"}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="role-name">Nome</Label><Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="role-desc">Descrição</Label><Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b"><th className="pb-3 text-left text-xs font-medium text-muted-foreground">Módulo</th>{ACTIONS.map((a) => <th key={a} className="pb-3 text-center text-xs font-medium text-muted-foreground">{ACTION_LABELS[a]}</th>)}</tr></thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="border-b last:border-0">
                    <td className="py-3 font-semibold">{MODULE_LABELS[m]}</td>
                    {ACTIONS.map((a) => {
                      const id = permId(m, a);
                      return <td key={a} className="py-3 text-center"><Checkbox className="mx-auto" aria-label={`${MODULE_LABELS[m]} ${ACTION_LABELS[a]}`} disabled={!id} checked={!!id && selected.has(id)} onCheckedChange={() => toggle(id)} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar papel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
