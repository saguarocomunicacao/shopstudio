import { useState } from "react";
import { Download, Loader2, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { downloadVideo, shareOrDownloadVideo, videoExtension, videoFileName } from "@/lib/video-download";

export type VideoVersion = {
  /** Identificador estável da versão (ex.: gravado, gravado_editado, ia). */
  key: string;
  label: string;
  source: string | Blob | null | undefined;
};

type Props = {
  /** Versões disponíveis. Com mais de uma, vira menu de escolha. */
  versions: VideoVersion[];
  /** Título do vídeo, usado no nome do arquivo. */
  title?: string | null;
  /** Nome do perfil, usado no nome do arquivo. */
  profileName?: string | null;
  label?: string;
  size?: "sm" | "lg" | "default" | "icon";
  variant?: "default" | "secondary" | "outline" | "ghost";
  className?: string;
};

/** Botão único de baixar o MP4, usado em todas as telas que mostram vídeo pronto. */
export function VideoDownloadButton({
  versions,
  title,
  profileName,
  label,
  size = "lg",
  variant = "default",
  className,
}: Props) {
  const [baixando, setBaixando] = useState(false);
  const isMobile = useIsMobile();
  const disponiveis = versions.filter((v) => !!v.source);
  if (!disponiveis.length) return null;

  const rotulo = label ?? (isMobile ? "Compartilhar / Baixar" : "Baixar vídeo");
  const carregando = isMobile ? "Preparando..." : "Baixando...";

  const baixar = async (version: VideoVersion) => {
    setBaixando(true);
    try {
      const ext = videoExtension(version.source ?? null);
      const sufixo = disponiveis.length > 1 ? `-${version.key.replace(/_/g, "-")}` : "";
      const nome = videoFileName(`${title ?? "video"}${sufixo}`, profileName, ext);
      const nomeAmigavel = [title ?? "Vídeo", profileName].filter(Boolean).join(" — ");
      if (isMobile) await shareOrDownloadVideo(version.source as string | Blob, nome, nomeAmigavel);
      else await downloadVideo(version.source as string | Blob, nome);
    } catch {
      toast.error(
        isMobile
          ? "Não foi possível compartilhar o vídeo. Tente novamente."
          : "Não foi possível baixar o vídeo. Tente novamente.",
      );
    } finally {
      setBaixando(false);
    }
  };

  const icone = baixando ? <Loader2 className="animate-spin" /> : isMobile ? <Share /> : <Download />;

  if (disponiveis.length === 1) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        disabled={baixando}
        onClick={() => void baixar(disponiveis[0]!)}
      >
        {icone}
        {size !== "icon" && (baixando ? carregando : rotulo)}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size={size} variant={variant} className={className} disabled={baixando}>
          {icone}
          {size !== "icon" && (baixando ? carregando : rotulo)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Escolha a versão</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {disponiveis.map((version) => (
          <DropdownMenuItem key={version.key} onClick={() => void baixar(version)}>
            <Download className="size-4" />
            {version.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
