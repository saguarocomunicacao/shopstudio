import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateAccess } from "@/lib/access";
import { ACAO_LABELS, type BillableAction } from "@/lib/custo-core";
import { ehIlimitado, useMovimentos, usePacotesDoPlano, useSaldos } from "@/lib/saldo";
import { userErrorMessage } from "@/lib/user-error";
import { PLAN_ACTIONS } from "./plans-card";
import { useStudio } from "./studio-context";

/** Gera a URL temporária da foto guardada no bucket privado. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar-url", path],
    enabled: !!path,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path!, 60 * 60);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

/** Plano do cliente (somente leitura nesta fase). */
function usePlan(userId: string | null) {
  return useQuery({
    queryKey: ["my-plan", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: me, error: meErr } = await supabase.from("app_users").select("tenant_id").eq("id", userId!).maybeSingle();
      if (meErr) throw new Error(meErr.message);
      if (!me?.tenant_id) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, plan_id, plans:plan_id ( id, name )")
        .eq("id", me.tenant_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; plan_id: string | null; plans: { id: string; name: string } | null } | null;
    },
  });
}


export function AccountPage() {
  const { access, userId } = useStudio();
  const qc = useQueryClient();
  const invalidateAccess = useInvalidateAccess();
  const me = access?.me;
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: tenant, isLoading: planLoading } = usePlan(userId);
  const { data: avatarUrl } = useAvatarUrl(me?.avatar_url);

  useEffect(() => {
    setName(me?.name ?? "");
  }, [me?.name]);

  const save = useMutation({
    mutationFn: async (patch: { name?: string; avatar_url?: string }) => {
      const { error } = await supabase.from("app_users").update(patch).eq("id", userId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Conta atualizada.");
      invalidateAccess();
      qc.invalidateQueries({ queryKey: ["avatar-url"] });
    },
    onError: (e) => {
      console.error("[account] save", e);
      toast.error(userErrorMessage(e, "Não foi possível salvar sua conta. Tente novamente."));
    },
  });

  const upload = async (file: File) => {
    if (!userId) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast.error("Escolha uma imagem JPG ou PNG.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 15 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      await save.mutateAsync({ avatar_url: path });
    } catch (e) {
      console.error("[account] avatar upload", e);
      toast.error(userErrorMessage(e, "Não foi possível enviar a foto. Tente novamente."));
    } finally {
      setUploading(false);
    }
  };

  const initials = (me?.name || me?.email || "?").slice(0, 2).toUpperCase();
  const planName = tenant?.plans?.name ?? "Sem plano definido";

  return (
    <>
      <div className="mb-6">
        <h1 className="page-title">Minha conta</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <h2 className="font-bold">Dados pessoais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Como você aparece para o restante da equipe.</p>

          <div className="mt-5 flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Sua foto" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-foreground text-sm font-bold text-background">{initials}</span>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? "Enviando..." : "Trocar foto"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">JPG ou PNG de até 15 MB.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">
              Nome
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              E-mail
              <Input value={me?.email ?? ""} readOnly disabled />
              <span className="text-xs font-normal text-muted-foreground">É o seu login e não pode ser alterado.</span>
            </label>
          </div>

          <Button
            className="mt-5"
            disabled={save.isPending || !name.trim() || name.trim() === (me?.name ?? "")}
            onClick={() => save.mutate({ name: name.trim() })}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Salvar alterações
          </Button>
        </section>

        <section className="panel">
          <h2 className="font-bold">Plano</h2>
          <p className="mt-1 text-sm text-muted-foreground">Condições da sua conta no Shop Studio.</p>

          {planLoading ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
          ) : (
            <div className="mt-5 rounded-xl bg-secondary px-4 py-3">
              <p className="text-sm font-semibold" data-testid="plano-atual">{planName}</p>
              <p className="text-xs text-muted-foreground">
                {tenant?.plans
                  ? "Você compra pacotes de quantidade que não expiram e usa uma unidade a cada ação realizada."
                  : "Aguardando definição do administrador."}
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Para mudar de plano, fale com o administrador.</p>
          {tenant?.name && <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">Conta: <strong className="font-semibold text-foreground">{tenant.name}</strong></p>}
        </section>
      </div>

      <SaldoPanel tenantId={tenant?.id ?? null} planId={tenant?.plan_id ?? null} />
    </>
  );
}

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Saldo restante por ação, em quantidade, e o histórico de compras e consumos. */
function SaldoPanel({ tenantId, planId }: { tenantId: string | null; planId: string | null }) {
  const { data: saldos, isLoading } = useSaldos(tenantId);
  const { data: pacotes } = usePacotesDoPlano(planId);
  const { data: movimentos } = useMovimentos(tenantId);

  const linhas = PLAN_ACTIONS.map((action) => ({
    action,
    ilimitado: ehIlimitado(pacotes, action),
    saldo: (saldos ?? []).find((s) => s.action_type === action)?.saldo ?? 0,
  }));

  return (
    <section className="panel mt-4">
      <h2 className="font-bold">Meu saldo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Quantidade restante de cada ação. As quantidades compradas não expiram.</p>

      {isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando saldo...</p>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {linhas.map((linha) => (
            <div key={linha.action} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
              <span className="text-sm text-muted-foreground">{ACAO_LABELS[linha.action]}</span>
              <strong className={`shrink-0 text-sm font-bold ${!linha.ilimitado && linha.saldo <= 0 ? "text-destructive" : ""}`}>
                {linha.ilimitado ? "Ilimitado" : linha.saldo}
              </strong>
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-6 text-sm font-bold">Compras e consumos</h3>
      {!(movimentos ?? []).length ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma movimentação registrada ainda.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Data</th><th className="p-2">Ação</th><th className="p-2">Movimento</th><th className="p-2 text-right">Quantidade</th><th className="p-2 text-right">Saldo depois</th></tr></thead>
            <tbody className="divide-y">
              {(movimentos ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="p-2 text-muted-foreground">{dataHora(m.created_at)}</td>
                  <td className="p-2 font-medium">{ACAO_LABELS[m.action_type]}</td>
                  <td className="p-2">{m.tipo === "credito" ? "Compra de pacote" : m.descricao || "Consumo"}</td>
                  <td className={`p-2 text-right font-semibold ${m.tipo === "credito" ? "text-primary" : ""}`}>{m.tipo === "credito" ? "+" : "-"}{Math.abs(m.quantidade)}</td>
                  <td className="p-2 text-right text-muted-foreground">{m.saldo_apos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
