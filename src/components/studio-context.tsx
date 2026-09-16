import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildCan, useAccess, useSession, type AccessData, type ActionKey, type DbProfile, type ModuleKey } from "@/lib/access";

type StudioContextValue = {
  activeProfileId: string;
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
};

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileId] = useState("all");
  const [dark, setDark] = useState(false);
  const { userId, loading: sessionLoading } = useSession();
  const { data: access, isLoading: accessLoading } = useAccess(userId);

  useEffect(() => {
    const stored = window.localStorage.getItem("creator-studio-theme");
    const nextDark = stored ? stored === "dark" : false;
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
  }, []);

  const changeTheme = (nextDark: boolean) => {
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("creator-studio-theme", nextDark ? "dark" : "light");
  };

  const profiles = useMemo(() => access?.profiles ?? [], [access]);

  useEffect(() => {
    if (activeProfileId === "all") return;
    if (!profiles.some((p) => p.id === activeProfileId)) setActiveProfileId("all");
  }, [profiles, activeProfileId]);

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
      pendingAccess: !!userId && !accessLoading && !isAdmin && profiles.length === 0,
    };
  }, [activeProfileId, dark, profiles, access, sessionLoading, accessLoading, userId]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
