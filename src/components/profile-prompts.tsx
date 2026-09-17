import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePromptOverrides, usePromptTemplates, type PromptTemplate } from "@/lib/prompts";
import { PlaceholderList } from "./prompts-page";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

function PromptRow({ profileId, template, override }: { profileId: string; template: PromptTemplate; override: string | null }) {
  const qc = useQueryClient();
  const inherited = override === null;
  const [body, setBody] = useState(override ?? template.body);
  const [open, setOpen] = useState(false);
  useEffect(() => setBody(override ?? template.body), [override, template.body]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["prompt-overrides", profileId] });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profile_prompt_overrides")
        .upsert({ profile_id: profileId, key: template.key, body }, { onConflict: "profile_id,key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Prompt deste perfil salvo."); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profile_prompt_overrides").delete().eq("profile_id", profileId).eq("key", template.key);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Voltou a usar o padrão."); setBody(template.body); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <div className="rounded-xl bg-secondary p-4">
      <button type="button" className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{template.title}</p>
          <p className="truncate text-xs text-muted-foreground">{inherited ? "usando padrão" : "versão própria deste perfil"}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${inherited ? "status-neutral" : "status-pink"}`}>
          {inherited ? "Padrão" : "Personalizado"}
        </span>
      </button>
      {open && (
        <>
          <PlaceholderList placeholders={template.placeholders} />
          <Textarea className="mt-3 min-h-44 bg-background font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={save.isPending || body === (override ?? template.body)} onClick={() => save.mutate()}>
              Usar só neste perfil
            </Button>
            {!inherited && (
              <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
                <RotateCcw />Voltar ao padrão
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Os 4 prompts do perfil: herdam o padrão global até serem sobrescritos. */
export function ProfilePrompts({ profileId }: { profileId: string }) {
  const { data: templates = [] } = usePromptTemplates();
  const { data: overrides = [] } = usePromptOverrides(profileId);
  const byKey = new Map(overrides.map((o) => [o.key, o.body]));

  if (!templates.length) return null;
  return (
    <div className="grid gap-3">
      {templates.map((t) => (
        <PromptRow key={t.key} profileId={profileId} template={t} override={byKey.get(t.key) ?? null} />
      ))}
    </div>
  );
}
