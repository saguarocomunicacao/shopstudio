import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateVoicePreview, refreshVoicePreview } from "@/lib/voices.functions";
import { userErrorMessage } from "@/lib/user-error";

type Props = {
  /** Id da voz no catálogo interno (para renovar o link quando expira). */
  voiceRowId?: string | null;
  previewUrl: string | null;
  label?: string;
};

/** Botão de play do preview da voz, renovando o link assinado quando expira. */
export function VoicePlayButton({ voiceRowId, previewUrl, label = "Ouvir voz" }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const refresh = useServerFn(refreshVoicePreview);
  const generate = useServerFn(generateVoicePreview);

  useEffect(() => () => audioRef.current?.pause(), []);

  const play = async (url: string) => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onpause = () => setPlaying(false);
    await audio.play();
    setPlaying(true);
  };

  const onClick = async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    let url = previewUrl;
    // Sem preview salvo (ex.: voz padrão Azure): gera um na hora e guarda.
    if (!url && voiceRowId) {
      setLoading(true);
      try {
        const created = await generate({ data: { id: voiceRowId } });
        url = created.url;
      } catch (e) {
        console.error("[voice-preview] generate", e);
        setLoading(false);
        toast.error(userErrorMessage(e, "Não foi possível gerar o preview. Tente novamente."));
        return;
      }
      setLoading(false);
    }
    if (!url) {
      toast.error("Esta voz ainda não tem preview.");
      return;
    }
    try {
      await play(url);
    } catch {
      if (!voiceRowId) {
        toast.error("Não foi possível tocar o preview.");
        return;
      }
      try {
        const renewed = await refresh({ data: { id: voiceRowId } });
        await play(renewed.url);
      } catch (e) {
        console.error("[voice-preview] play", e);
        toast.error(userErrorMessage(e, "Não foi possível tocar o preview. Tente novamente."));
      }
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-primary hover:bg-primary/10"
      title={label}
      aria-label={label}
      disabled={!previewUrl && !voiceRowId}
      onClick={(e) => {
        e.stopPropagation();
        void onClick();
      }}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : playing ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </Button>
  );
}
