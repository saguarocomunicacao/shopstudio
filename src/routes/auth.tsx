import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Creator Studio" },
      { name: "description", content: "Acesse o painel de gestão de conteúdo afiliado do Creator Studio." },
      { property: "og:title", content: "Entrar — Creator Studio" },
      { property: "og:description", content: "Acesse o painel de gestão de conteúdo afiliado do Creator Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { name } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) { setInfo("Conta criada. Confirme seu email para entrar."); return; }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      await supabase.rpc("ensure_app_user");
      navigate({ to: "/", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível continuar.";
      setError(message.includes("Invalid login credentials") ? "Email ou senha incorretos." : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-sm font-black text-background">CS</span>
          <h1 className="glitch-logo text-2xl font-black" data-text="Creator Studio">Creator Studio</h1>
          <p className="text-sm text-muted-foreground">Conteúdo afiliado, sob controle.</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`h-9 rounded-md text-sm font-semibold transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como devemos te chamar" required />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
          {info && <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">{info}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            O primeiro cadastro do sistema recebe acesso de administrador. Os demais aguardam liberação.
          </p>
        </form>
      </div>
    </main>
  );
}
