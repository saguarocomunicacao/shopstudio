import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoicePlayButton } from "@/components/voice-play-button";
import { CatalogDialog, CloneDialog } from "@/components/voice-dialogs";
import { FONTE_LABELS, GENERO_LABELS, useVoices, type VoiceGenero } from "@/lib/voices";

type Props = {
  profileId?: string | null;
  value: string | null;
  onChange: (voiceRef: string | null) => void;
  /** Permite cadastrar vozes novas (catálogo e clonagem) direto daqui. */
  canManage?: boolean;
};

const FILTROS: { value: VoiceGenero | "todos"; label: string }[] = [
  { value: "todos", label: "Todos os gêneros" },
  { value: "feminino", label: "Feminina" },
  { value: "masculino", label: "Masculina" },
  { value: "neutro", label: "Neutra" },
];

/** Seletor da voz de narração do perfil, com filtro por gênero e preview. */
export function VoiceSelect({ profileId, value, onChange, canManage = false }: Props) {
  const { data: voices = [] } = useVoices(profileId ?? null);
  const [genero, setGenero] = useState<VoiceGenero | "todos">("todos");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["voices"] });

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

      {canManage && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Catálogo ElevenLabs
          </Button>
          <Button type="button" size="sm" onClick={() => setCloneOpen(true)}>
            <Mic className="mr-1.5 h-4 w-4" /> Clonar nova voz
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Vozes adicionadas aqui ficam disponíveis para todos os perfis. A clonagem gera um preview e tem custo de
            narração.
          </p>
        </div>
      )}

      {canManage && (
        <>
          <CatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} existing={voices} onSaved={invalidate} />
          <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} onSaved={invalidate} />
        </>
      )}
    </div>
  );
}
