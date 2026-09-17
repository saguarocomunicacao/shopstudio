import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_EXPIRED_EVENT, resetSessionExpired } from "@/lib/session-guard";

/** Modal amigavel quando a sessao expira de verdade (sem erro tecnico na tela). */
export function SessionExpiredDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onExpired = () => setOpen(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (!open) return null;

  const signInAgain = async () => {
    const back = `${window.location.pathname}${window.location.search}`;
    setOpen(false);
    resetSessionExpired();
    try { await supabase.auth.signOut(); } catch { /* sessao ja encerrada */ }
    navigate({ to: "/entrar", search: { redirect: back }, replace: true });
  };

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-background/85 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm text-center">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
          <LogIn className="h-5 w-5" />
        </span>
        <h2 className="text-xl font-black">Sua sessão expirou</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Por segurança, encerramos o acesso depois de um tempo. Entre novamente para continuar de onde parou.
        </p>
        <Button className="mt-6 w-full" onClick={() => void signInAgain()}>Entrar novamente</Button>
      </div>
    </div>
  );
}
