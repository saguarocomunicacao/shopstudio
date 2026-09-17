import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshVoicePreview } from "@/lib/voices.functions";

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
  const refresh = useServerFn(refreshVoicePreview);

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
    if (!previewUrl) {
      toast.error("Esta voz ainda não tem preview.");
      return;
    }
    try {
      await play(previewUrl);
    } catch {
      if (!voiceRowId) {
        toast.error("Não foi possível tocar o preview.");
        return;
      }
      try {
        const { url } = await refresh({ data: { id: voiceRowId } });
        await play(url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível tocar o preview.");
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
      disabled={!previewUrl}
      onClick={(e) => {
        e.stopPropagation();
        void onClick();
      }}
    >
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
