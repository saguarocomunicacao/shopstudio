import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";

type TransitionMode = "entering" | "leaving" | "loading";

type TransitionContextValue = {
  active: boolean;
  runTransition: (mode: Exclude<TransitionMode, "loading">) => Promise<void>;
};

const TransitionContext = createContext<TransitionContextValue | null>(null);

const copy: Record<TransitionMode, { title: string; detail: string }> = {
  entering: { title: "Preparando seu estúdio", detail: "Organizando perfis, projetos e ferramentas" },
  leaving: { title: "Até a próxima", detail: "Encerrando sua sessão com segurança" },
  loading: { title: "Abrindo o Shop Studio", detail: "Carregando seu espaço de criação" },
};

export function AppTransition({ mode = "loading" }: { mode?: TransitionMode }) {
  const text = copy[mode];

  return (
    <div className="app-transition" role="status" aria-live="polite" aria-label={text.title}>
      <div className="app-transition-grid" aria-hidden="true" />
      <div className="app-transition-glow app-transition-glow-cyan" aria-hidden="true" />
      <div className="app-transition-glow app-transition-glow-pink" aria-hidden="true" />
      <div className="app-transition-content">
        <div className="app-transition-mark">
          <img src={logoDarkAsset.url} alt="Shop Studio" className="app-transition-logo" />
        </div>
        <div className="app-transition-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

export function AppTransitionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Exclude<TransitionMode, "loading"> | null>(null);
  const activeRef = useRef(false);

  const runTransition = useCallback(async (nextMode: Exclude<TransitionMode, "loading">) => {
    if (activeRef.current) return;
    activeRef.current = true;
    setMode(nextMode);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 950));
    window.setTimeout(() => {
      setMode(null);
      activeRef.current = false;
    }, 450);
  }, []);

  const value = useMemo(() => ({ active: mode !== null, runTransition }), [mode, runTransition]);

  return (
    <TransitionContext.Provider value={value}>
      {children}
      {mode ? <AppTransition mode={mode} /> : null}
    </TransitionContext.Provider>
  );
}

export function useAppTransition() {
  const context = useContext(TransitionContext);
  if (!context) throw new Error("useAppTransition precisa estar dentro de AppTransitionProvider");
  return context;
}