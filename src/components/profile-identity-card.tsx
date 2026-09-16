import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { TONE_OPTIONS, useProfileIdentity } from "@/lib/content";
import { LanguageSelect } from "./language-select";
import { useStudio } from "./studio-context";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível salvar.");

export function ProfileIdentityCard() {
  const { activeProfile, activeProfileId, can } = useStudio();
  const qc = useQueryClient();
  const { data: identity } = useProfileIdentity(activeProfileId);
  const canEdit = !!activeProfile && can("perfis", "editar", activeProfile.id);

  const [tone, setTone] = useState("descontraido");
  const [language, setLanguage] = useState("pt-BR");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setTone(identity?.tone ?? "descontraido");
    setLanguage(identity?.language ?? "pt-BR");
    setNotes(identity?.style_notes ?? "");
  }, [identity, activeProfileId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!activeProfile) throw new Error("Selecione um perfil no topo.");
      const { error } = await supabase
        .from("profile_identities")
        .upsert({ profile_id: activeProfile.id, tone, language, style_notes: notes }, { onConflict: "profile_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Identidade salva."); qc.invalidateQueries({ queryKey: ["profile-identity"] }); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <section className="panel">
      <h2 className="font-bold">Identidade do perfil</h2>
      <p className="mt-1 text-sm text-muted-foreground">Base usada pela IA para escrever os roteiros deste perfil.</p>
      {!activeProfile ? (
        <p className="mt-5 rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
          Escolha um perfil no seletor do topo para configurar a identidade.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="i-tone">Tom de voz</Label>
              <Select value={tone} onValueChange={setTone} disabled={!canEdit}>
                <SelectTrigger id="i-tone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="i-lang">Idioma</Label>
              <LanguageSelect id="i-lang" value={language} onChange={setLanguage} disabled={!canEdit} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="i-notes">Observações de estilo</Label>
            <Textarea id="i-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Ex: falar direto com a câmera, frases curtas, sempre mostrar o produto em uso." />
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button disabled={save.isPending} onClick={() => save.mutate()}>Salvar identidade</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
