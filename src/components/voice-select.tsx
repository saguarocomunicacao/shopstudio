import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoicePlayButton } from "@/components/voice-play-button";
import { FONTE_LABELS, GENERO_LABELS, useVoices, type VoiceGenero } from "@/lib/voices";

type Props = {
  profileId?: string | null;
  value: string | null;
  onChange: (voiceRef: string | null) => void;
};

const FILTROS: { value: VoiceGenero | "todos"; label: string }[] = [
  { value: "todos", label: "Todos os gêneros" },
  { value: "feminino", label: "Feminina" },
  { value: "masculino", label: "Masculina" },
  { value: "neutro", label: "Neutra" },
];

/** Seletor da voz de narração do perfil, com filtro por gênero e preview. */
export function VoiceSelect({ profileId, value, onChange }: Props) {
  const { data: voices = [] } = useVoices(profileId ?? null);
  const [genero, setGenero] = useState<VoiceGenero | "todos">("todos");

  const lista = useMemo(
    () => voices.filter((v) => genero === "todos" || v.genero === genero),
    [voices, genero],
  );
  const selecionada = voices.find((v) => v.id === value) ?? null;

  return (
    <div className="space-y-1.5">
      <Label>Voz da narração</Label>
      <div className="flex items-center gap-2">
        <Select value={genero} onValueChange={(v) => setGenero(v as VoiceGenero | "todos")}>
          <SelectTrigger className="w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value ?? "padrao"} onValueChange={(v) => onChange(v === "padrao" ? null : v)}>
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue placeholder="Voz padrão do idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="padrao">Voz padrão do idioma</SelectItem>
            {lista.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nome} · {v.genero ? GENERO_LABELS[v.genero] : "—"} · {FONTE_LABELS[v.fonte]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <VoicePlayButton voiceRowId={selecionada?.id ?? null} previewUrl={selecionada?.preview_url ?? null} />
      </div>
      <p className="text-xs text-muted-foreground">
        Sem escolha, o vídeo continua usando a voz padrão do idioma na montagem.
      </p>
    </div>
  );
}
