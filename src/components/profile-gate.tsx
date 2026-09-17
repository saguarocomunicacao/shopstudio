import { Link } from "@tanstack/react-router";
import { UserSquare2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "./studio-context";

export const OPEN_PROFILE_PICKER_EVENT = "shop-studio:open-profile-picker";
export const openProfilePicker = () => window.dispatchEvent(new CustomEvent(OPEN_PROFILE_PICKER_EVENT));

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="panel max-w-md text-center">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">{icon}</span>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-6 flex justify-center">{action}</div>
      </div>
    </div>
  );
}

/** Todas as telas filtradas passam por aqui: sem perfil cadastrado, sem perfil ativo, ou conteudo normal. */
export function ProfileGate({ children }: { children: ReactNode }) {
  const { profiles, activeProfileId, loading } = useStudio();

  if (loading) return null;

  if (!profiles.length) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="Crie seu primeiro perfil"
        text="Os conteúdos são organizados por perfil. Crie um para começar a produzir."
        action={<Button asChild><Link to="/app/perfis">Criar perfil</Link></Button>}
      />
    );
  }

  if (!activeProfileId) {
    return (
      <EmptyState
        icon={<UserSquare2 className="h-5 w-5" />}
        title="Selecione um perfil"
        text="Escolha um perfil no seletor acima para ver o conteúdo dele."
        action={<Button onClick={openProfilePicker}>Escolher perfil</Button>}
      />
    );
  }

  return <>{children}</>;
}
