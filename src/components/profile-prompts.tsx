import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { restoreProfilePrompt, seedProfilePrompts } from "@/lib/prompts.functions";
import { usePromptOverrides, usePromptTemplates, type PromptOverride, type PromptTemplate } from "@/lib/prompts";
import { PlaceholderList } from "./prompts-page";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

function PromptRow({
  profileId,
  template,
  override,
}: {
  profileId: string;
  template: PromptTemplate;
  override: PromptOverride | null;
}) {
  const qc = useQueryClient();
  const restaurar = useServerFn(restoreProfilePrompt);
  const salvo = override?.body ?? "";
  const igualAoPadrao = (override?.origem ?? "copiado_do_padrao") === "copiado_do_padrao";
  const desatualizado =
    igualAoPadrao && !!override?.origem_versao && new Date(override.origem_versao) < new Date(template.updated_at);

  const [body, setBody] = useState(salvo);
  const [open, setOpen] = useState(false);
  useEffect(() => setBody(salvo), [salvo]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["prompt-overrides", profileId] });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profile_prompt_overrides")
        .upsert(
          { profile_id: profileId, key: template.key, body, origem: "personalizado" },
          { onConflict: "profile_id,key" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Prompt deste perfil salvo."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const reset = useMutation({
    mutationFn: () => restaurar({ data: { profileId, key: template.key } }),
    onSuccess: () => { toast.success("Prompt restaurado com o padrão do sistema."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <div className="rounded-xl bg-secondary p-4">
      <button type="button" className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{template.title}</p>
          <p className="truncate text-xs text-muted-foreground">{template.description}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${igualAoPadrao ? "status-neutral" : "status-pink"}`}>
          {igualAoPadrao ? "Igual ao padrão do sistema" : "Personalizado"}
        </span>
      </button>

      {desatualizado && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
          <span className="font-semibold text-primary">Há uma versão mais recente do prompt padrão</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-primary" disabled={reset.isPending} onClick={() => reset.mutate()}>
            <ArrowUpCircle className="size-3.5" />Atualizar
          </Button>
        </div>
      )}

      {open && (
        <>
          <PlaceholderList placeholders={template.placeholders} />
          <Textarea className="mt-3 min-h-44 bg-background font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={save.isPending || body === salvo} onClick={() => save.mutate()}>
              Salvar prompt
            </Button>
            <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
              <RotateCcw />Restaurar padrão do sistema
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Os 4 prompts do perfil: cópia própria, criada a partir do padrão do sistema. */
export function ProfilePrompts({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const semear = useServerFn(seedProfilePrompts);
  const { data: templates = [] } = usePromptTemplates();
  const { data: overrides, isLoading } = usePromptOverrides(profileId);
  const byKey = new Map((overrides ?? []).map((o) => [o.key, o]));

  // Perfil sem cópia ainda (criado antes, ou prompt novo no padrão): gera a cópia inicial.
  const faltando = !isLoading && templates.length > 0 && templates.some((t) => !byKey.has(t.key));
  useEffect(() => {
    if (!faltando) return;
    void semear({ data: { profileId } })
      .then(() => qc.invalidateQueries({ queryKey: ["prompt-overrides", profileId] }))
      .catch(() => undefined);
  }, [faltando, profileId, qc, semear]);

  if (!templates.length) return null;
  return (
    <div className="grid gap-3">
      {templates.map((t) => (
        <PromptRow key={t.key} profileId={profileId} template={t} override={byKey.get(t.key) ?? null} />
      ))}
    </div>
  );
}
