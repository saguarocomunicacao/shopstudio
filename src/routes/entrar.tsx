import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark, ChevronRight, Eye, EyeOff, Heart, Loader2, MessageCircle, Share2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppTransition } from "@/components/app-transition";
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/user-error";
import { resetSessionExpired } from "@/lib/session-guard";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";
import heroPowerbank from "@/assets/hero-powerbank.png.asset.json";

export const Route = createFileRoute("/entrar")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const value = search["redirect"];
    return typeof value === "string" && value.startsWith("/") ? { redirect: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Entrar — Shop Studio" },
      { name: "description", content: "Acesse o painel de gestão de conteúdo afiliado do Shop Studio." },
      { property: "og:title", content: "Entrar — Shop Studio" },
      { property: "og:description", content: "Acesse o painel de gestão de conteúdo afiliado do Shop Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const goToApp = () => navigate({ to: redirect ?? "/app", replace: true });
  const { active: transitioning, runTransition } = useAppTransition();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Esta tela é sempre escura, independente da preferência salva.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.add("dark");
    return () => { if (!had) root.classList.remove("dark"); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goToApp();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, redirect]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/entrar`, data: { name } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) { setInfo("Cadastro recebido. Confirme seu email e aguarde: seu acesso passará por avaliação do administrador."); return; }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      await supabase.rpc("ensure_app_user");
      resetSessionExpired();
      await runTransition("entering");
      goToApp();
    } catch (err) {
      console.error("[auth]", err);
      const raw = err instanceof Error ? err.message : "";
      if (/invalid login credentials/i.test(raw)) setError("Email ou senha incorretos.");
      else if (/email not confirmed/i.test(raw)) setError("Confirme seu email antes de entrar.");
      else setError(userErrorMessage(err, "Não foi possível continuar. Tente novamente."));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: "login" | "signup") => { setMode(m); setError(null); setInfo(null); };
  const loading = busy || transitioning;
  const fieldClass = "h-11 rounded-lg border border-border bg-input text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0";

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[55fr_45fr]">
      <aside className="entrar-brand relative hidden flex-col overflow-hidden p-10 lg:flex">
        <img src={logoDarkAsset.url} alt="Shop Studio" className="h-8 w-auto self-start" />
        <div className="flex flex-1 items-center gap-10 py-10">
          <div className="max-w-md">
            <h1 className="font-display text-[40px] font-semibold leading-[1.1] text-sidebar-foreground">Do produto em alta<br />ao vídeo pronto.</h1>
            <p className="mt-4 text-base text-muted-foreground">Garimpo, roteiro, cenas, vídeo e revisão num só painel.</p>
          </div>
          <div className="shrink-0 rotate-[4deg]">
            <div className="landing-phone-frame relative aspect-[9/16] w-[260px] overflow-hidden rounded-[40px] p-[6px] shadow-none">
              <div className="landing-phone-screen relative h-full overflow-hidden rounded-[34px]">
                <img src={heroPowerbank.url} alt="Celular com vídeo de um power bank rosa no TikTok" className="absolute inset-0 h-full w-full object-cover" />
                <div className="landing-video-vignette absolute inset-0" />
                <div className="absolute right-3 top-[33%] z-10 flex flex-col items-center gap-3.5 text-landing-text">
                  {[{ i: <Heart />, l: "18,4K" }, { i: <MessageCircle />, l: "326" }, { i: <Bookmark />, l: "1.2K" }, { i: <Share2 />, l: "Enviar" }].map((a) => (
                    <div key={a.l} className="flex flex-col items-center gap-0.5"><span className="[&_svg]:size-5">{a.i}</span><span className="text-[9px] font-semibold">{a.l}</span></div>
                  ))}
                </div>
                <div className="absolute inset-x-4 bottom-5 z-10 pr-10 text-left">
                  <p className="text-[12px] font-bold text-landing-text">@promosdaregina</p>
                  <p className="mt-1 text-[14px] font-bold leading-5 text-landing-text">Bateria no fim na hora de sair?</p>
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-landing-text px-2.5 py-1.5 text-[10px] font-bold text-landing-bg"><ShoppingBag className="size-3" /> Toque no carrinho <ChevronRight className="size-3" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">shopstudio.com.br</p>
      </aside>

      <section className="flex min-h-screen flex-col bg-card px-6 py-8">
        <img src={logoDarkAsset.url} alt="Shop Studio" className="h-7 w-auto self-start lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <form onSubmit={submit} className="entrar-rise w-full max-w-[400px] space-y-5">
            <div>
              <h2 className="font-display text-[28px] font-semibold leading-tight">{mode === "login" ? "Entrar" : "Criar conta"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use o email da sua empresa.</p>
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px] font-normal text-muted-foreground">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como devemos te chamar" required className={fieldClass} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] font-normal text-muted-foreground">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required className={fieldClass} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] font-normal text-muted-foreground">Senha</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={`${fieldClass} pr-11`} />
                <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p role="alert" className="rounded-lg border border-primary bg-primary/12 px-3 py-2.5 text-[13px]">{error}</p>}
            {info && <p className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-[13px]">{info}</p>}

            <Button type="submit" className="h-11 w-full font-display text-[15px]" disabled={loading}>
              {loading ? <><Loader2 className="animate-spin" />{mode === "login" ? "Entrando..." : "Criando conta..."}</> : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>

            {mode === "signup" && (
              <p className="text-[13px] text-muted-foreground">Sua conta é criada na hora e liberada pela equipe do Shop Studio antes do primeiro acesso.</p>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "Ainda não tem conta? " : "Já tem conta? "}
              <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="font-medium text-cyan-ink hover:underline">
                {mode === "login" ? "Criar conta" : "Entrar"}
              </button>
            </p>
          </form>
        </div>
        <nav className="flex justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
          <Link to="/seguranca" className="hover:text-foreground">Segurança</Link>
        </nav>
      </section>
    </main>
  );
}
