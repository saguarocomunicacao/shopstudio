import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { profiles } from "@/lib/studio-data";

type StudioContextValue = {
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
  activeProfile: (typeof profiles)[number] | undefined;
  dark: boolean;
  setDark: (dark: boolean) => void;
  isAdmin: boolean;
};

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileId] = useState("all");
  const [dark, setDark] = useState(false);

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

  const value = useMemo(() => ({
    activeProfileId,
    setActiveProfileId,
    activeProfile: profiles.find((profile) => profile.id === activeProfileId),
    dark,
    setDark: changeTheme,
    isAdmin: true,
  }), [activeProfileId, dark]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}