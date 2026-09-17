import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildCan, useAccess, useSession, type AccessData, type ActionKey, type DbProfile, type ModuleKey } from "@/lib/access";

const PROFILE_STORAGE_KEY = "shop-studio-active-profile";

type StudioContextValue = {
  /** Perfil ativo do filtro global. `null` significa "nenhum perfil selecionado". */
  activeProfileId: string | null;
  setActiveProfileId: (id: string) => void;
  activeProfile: DbProfile | undefined;
  activeSlug: string | null;
  profiles: DbProfile[];
  dark: boolean;
  setDark: (dark: boolean) => void;
  isAdmin: boolean;
  can: (module: ModuleKey, action: ActionKey, profileId?: string | null) => boolean;
  access: AccessData | undefined;
  loading: boolean;
  userId: string | null;
  pendingAccess: boolean;
  isSuperAdmin: boolean;
  approvalStatus: string;
};

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const { userId, loading: sessionLoading } = useSession();
  const { data: access, isLoading: accessLoading } = useAccess(userId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const stored = window.localStorage.getItem("creator-studio-theme");
    const nextDark = stored ? stored === "dark" : false;
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
  }, []);

  // Restaura o perfil ativo a partir da querystring (?perfil=id) ou do ultimo escolhido.
  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get("perfil");
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    setActiveProfileIdState(fromUrl || stored || null);
  }, []);

  const changeTheme = (nextDark: boolean) => {
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("creator-studio-theme", nextDark ? "dark" : "light");
  };

  const profiles = useMemo(() => access?.profiles ?? [], [access]);

  // Se o perfil guardado nao existe mais, volta para "nenhum selecionado".
  useEffect(() => {
    if (!activeProfileId || sessionLoading || accessLoading || !access) return;
    if (!profiles.some((p) => p.id === activeProfileId)) {
      setActiveProfileIdState(null);
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, [profiles, activeProfileId, accessLoading, sessionLoading, access]);

  // Mantem ?perfil=id na URL ao navegar entre telas e no refresh.
  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href);
      const current = url.searchParams.get("perfil");
      if (activeProfileId) url.searchParams.set("perfil", activeProfileId);
      else url.searchParams.delete("perfil");
      if (current !== (activeProfileId ?? null)) {
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };
    sync();
    // O router reescreve a URL logo apos navegar; reaplica o parametro no tick seguinte.
    const timer = window.setTimeout(sync, 50);
    return () => window.clearTimeout(timer);
  }, [activeProfileId, pathname]);

  const setActiveProfileId = (id: string) => {
    setActiveProfileIdState(id);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, id);
  };

  const value = useMemo<StudioContextValue>(() => {
    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    const isAdmin = access?.isAdmin ?? false;
    return {
      activeProfileId,
      setActiveProfileId,
      activeProfile,
      activeSlug: activeProfile?.slug ?? null,
      profiles,
      dark,
      setDark: changeTheme,
      isAdmin,
      can: buildCan(access),
      access,
      loading: sessionLoading || accessLoading,
      userId,
      isSuperAdmin: access?.isSuperAdmin ?? false,
      approvalStatus: access?.approvalStatus ?? "pendente",
      pendingAccess:
        !!userId && !accessLoading && (access?.approvalStatus !== "aprovado" || (!isAdmin && profiles.length === 0)),
    };
  }, [activeProfileId, dark, profiles, access, sessionLoading, accessLoading, userId]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
