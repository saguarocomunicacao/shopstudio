import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transcribeAudio } from "@/lib/transcription.functions";

/** Tempo máximo de um ditado, para não gerar áudio gigante nem custo à toa. */
const MAX_SEGUNDOS = 120;

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível transcrever o áudio.");

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Botão de microfone: grava a fala da pessoa e devolve o texto transcrito.
 * A digitação manual continua disponível o tempo todo.
 */
export function VoiceDictationButton({
  profileId,
  jobId,
  disabled,
  onText,
}: {
  profileId: string | null;
  jobId?: string | null;
  disabled?: boolean;
  onText: (texto: string) => void;
}) {
  const transcrever = useServerFn(transcribeAudio);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inicioRef = useRef(0);

  const suportado =
    typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => {
      const passados = Math.floor((Date.now() - inicioRef.current) / 1000);
      setSegundos(passados);
      if (passados >= MAX_SEGUNDOS) recorderRef.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [gravando]);

  useEffect(() => {
    return () => {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const enviar = useMutation({
    mutationFn: async ({ blob, duracao }: { blob: Blob; duracao: number }) => {
      if (!profileId) throw new Error("Selecione um perfil antes de usar o ditado por voz.");
      if (duracao < 1 || blob.size < 2048) {
        throw new Error("O áudio ficou muito curto. Toque no microfone e fale por alguns segundos.");
      }
      const audioBase64 = await blobToBase64(blob);
      return transcrever({
        data: {
          profileId,
          jobId: jobId ?? null,
          audioBase64,
          mimeType: blob.type || "audio/webm",
          durationSeconds: duracao,
        },
      });
    },
    onSuccess: (r) => {
      onText(r.texto);
      toast.success("Fala transcrita. Ajuste o texto se quiser.");
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const iniciar = async () => {
    if (!suportado) {
      toast.error("Este aparelho ou navegador não permite gravar áudio. Digite o assunto no campo ao lado.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Precisamos da permissão do microfone. Libere o acesso nas configurações do navegador.");
      return;
    }
    streamRef.current = stream;
    const tipo = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && partes.push(e.data);
    recorder.onstop = () => {
      const duracao = (Date.now() - inicioRef.current) / 1000;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setGravando(false);
      setSegundos(0);
      const blob = new Blob(partes, { type: "audio/webm" });
      enviar.mutate({ blob, duracao });
    };
    recorderRef.current = recorder;
    inicioRef.current = Date.now();
    setSegundos(0);
    setGravando(true);
    recorder.start();
  };

  const parar = () => recorderRef.current?.stop();

  if (enviar.isPending) {
    return (
      <Button type="button" variant="secondary" size="lg" disabled className="h-12 w-full sm:w-auto">
        <Loader2 className="animate-spin" />
        Transcrevendo...
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={gravando ? "destructive" : "secondary"}
      size="lg"
      disabled={disabled || !profileId}
      aria-label={gravando ? "Parar gravação do ditado" : "Ditar o assunto por voz"}
      className="h-12 w-full sm:w-auto"
      onClick={() => (gravando ? parar() : void iniciar())}
    >
      {gravando ? (
        <>
          <Square className="fill-current" />
          Parar ({segundos}s)
        </>
      ) : (
        <>
          <Mic className="animate-none" />
          Ditar por voz
        </>
      )}
    </Button>
  );
}
