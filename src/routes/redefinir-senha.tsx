import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/user-error";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Redefinir senha — Shop Studio" },
    { name: "description", content: "Crie uma nova senha para sua conta Shop Studio." },
    { property: "og:title", content: "Redefinir senha — Shop Studio" },
    { property: "og:description", content: "Crie uma nova senha para sua conta Shop Studio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { toast.error("As senhas não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      console.error("[reset-password]", error);
      toast.error(userErrorMessage(error, "Não foi possível atualizar a senha. Tente novamente."));
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/app", replace: true });
  };
  return <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><form className="panel w-full max-w-sm space-y-4" onSubmit={submit}><div><p className="text-xs font-bold uppercase text-primary">Shop Studio</p><h1 className="mt-1 text-2xl font-black">Redefinir senha</h1><p className="mt-2 text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p></div><label className="grid gap-2"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="grid gap-2"><Label htmlFor="confirm-password">Confirmar senha</Label><Input id="confirm-password" type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label><Button className="w-full" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar nova senha"}</Button></form></main>;
}