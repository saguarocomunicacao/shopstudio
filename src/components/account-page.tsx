import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateAccess } from "@/lib/access";
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
        .select("id, name, plans:plan_id ( name, billing_model, price_cents )")
        .eq("id", me.tenant_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; plans: { name: string; billing_model: string; price_cents: number } | null } | null;
    },
  });
}

const BILLING_LABEL: Record<string, string> = { gratuito: "Sem cobrança", por_video: "Cobrado por vídeo", mensal: "Mensalidade" };
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const upload = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem.");
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
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const initials = (me?.name || me?.email || "?").slice(0, 2).toUpperCase();
  const planName = tenant?.plans?.name ?? "Sem plano definido";

  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase text-primary">Sua conta</p>
        <h1 className="text-2xl font-black sm:text-3xl">Minha conta</h1>
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
                accept="image/*"
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
              <p className="mt-2 text-xs text-muted-foreground">Imagem de até 5 MB.</p>
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
                  ? "Cobrança por item: cada uso tem quantidade incluída no mês e preço por unidade."
                  : "Aguardando definição do administrador."}
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Para mudar de plano, fale com o administrador.</p>
          {tenant?.name && <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">Conta: <strong className="font-semibold text-foreground">{tenant.name}</strong></p>}
        </section>
      </div>
    </>
  );
}
