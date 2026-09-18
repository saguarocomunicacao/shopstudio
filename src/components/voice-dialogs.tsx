import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { VoicePlayButton } from "@/components/voice-play-button";
import { GENERO_LABELS, type VoiceGenero, type VoiceRow } from "@/lib/voices";
import { cloneVoice, listElevenLabsVoices } from "@/lib/voices.functions";

/**
 * Diálogos compartilhados de cadastro de vozes (catálogo ElevenLabs e
 * clonagem). As vozes criadas aqui ficam disponíveis para todos os perfis.
 */

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });

export function CatalogDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: VoiceRow[];
  onSaved: () => void;
}) {
  const list = useServerFn(listElevenLabsVoices);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["elevenlabs-catalog", open],
    enabled: open,
    queryFn: async () => list({ data: undefined }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const rows = (data?.voices ?? [])
        .filter((v) => selected[v.voiceId])
        .map((v) => ({
          nome: v.nome,
          fonte: "elevenlabs_catalogo" as const,
          voice_id: v.voiceId,
          genero: v.genero,
          profile_id: null,
          preview_url: v.previewUrl,
        }));
      if (rows.length === 0) throw new Error("Selecione ao menos uma voz.");
      const { error: insertError } = await supabase.from("voices").insert(rows);
      if (insertError) throw new Error(insertError.message);
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} ${count === 1 ? "voz adicionada" : "vozes adicionadas"}.`);
      setSelected({});
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const jaCadastrada = new Set(existing.map((v) => v.voice_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Vozes do catálogo ElevenLabs</DialogTitle>
          <DialogDescription>Escolha as vozes da conta que ficarão disponíveis nos perfis.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Buscando vozes…</p>}
          {error && <p className="py-6 text-center text-sm text-destructive">{errMessage(error)}</p>}
          {(data?.voices ?? []).map((v) => {
            const already = jaCadastrada.has(v.voiceId);
            return (
              <label
                key={v.voiceId}
                className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-secondary"
              >
                <Checkbox
                  checked={!!selected[v.voiceId]}
                  disabled={already}
                  onCheckedChange={(c) => setSelected((s) => ({ ...s, [v.voiceId]: c === true }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{v.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.genero ? GENERO_LABELS[v.genero] : "Gênero não informado"}
                    {already ? " · já cadastrada" : ""}
                  </span>
                </span>
                <VoicePlayButton previewUrl={v.previewUrl} />
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Adicionar selecionadas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloneDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const clone = useServerFn(cloneVoice);
  const [nome, setNome] = useState("");
  const [genero, setGenero] = useState<VoiceGenero | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);

  const reset = () => {
    setNome("");
    setGenero("");
    setFiles([]);
    setConsent(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (nome.trim().length < 2) throw new Error("Informe o nome da voz.");
      if (files.length === 0) throw new Error("Envie ao menos uma amostra de áudio.");
      const samples = await Promise.all(
        files.slice(0, 5).map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "audio/mpeg",
          base64: await fileToBase64(f),
        })),
      );
      return clone({
        data: { nome: nome.trim(), genero: genero || null, profileId: null, consentimento: true as const, samples },
      });
    },
    onSuccess: () => {
      toast.success("Voz clonada e adicionada ao catálogo.");
      reset();
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clonar nova voz</DialogTitle>
          <DialogDescription>
            Envie 1 a 2 minutos de áudio limpo da pessoa, sem música nem ruído de fundo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="voz-nome">Nome da voz</Label>
            <Input id="voz-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Voz da Regina" />
          </div>
          <div className="space-y-1.5">
            <Label>Gênero</Label>
            <Select value={genero} onValueChange={(v) => setGenero(v as VoiceGenero)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feminino">Feminina</SelectItem>
                <SelectItem value="masculino">Masculina</SelectItem>
                <SelectItem value="neutro">Neutra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voz-audio">Amostras de áudio</Label>
            <Input
              id="voz-audio"
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.length} {files.length === 1 ? "arquivo" : "arquivos"} selecionados
              </p>
            )}
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-secondary px-3 py-3">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
            <span className="text-xs text-muted-foreground">
              Confirmo que tenho o consentimento da pessoa para clonar e usar a voz dela nos vídeos.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!consent || save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Clonar voz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
