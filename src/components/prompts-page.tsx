import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePromptOverrides, usePromptTemplates, type PromptTemplate } from "@/lib/prompts";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";
import { actionError } from "@/lib/api-keys";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-6"><p className="mb-1 text-xs font-bold uppercase text-primary">{eyebrow}</p><h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1></div>;
}

export function PlaceholderList({ placeholders }: { placeholders: string[] }) {
  if (!placeholders.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {placeholders.map((p) => (
        <span key={p} className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground">{`{${p}}`}</span>
      ))}
    </div>
  );
}

function TemplateCard({ template }: { template: PromptTemplate }) {
  const qc = useQueryClient();
  const [body, setBody] = useState(template.body);
  useEffect(() => setBody(template.body), [template.body]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("prompt_templates").update({ body }).eq("key", template.key);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Prompt padrão atualizado."); qc.invalidateQueries({ queryKey: ["prompt-templates"] }); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const dirty = body !== template.body;

  return (
    <section className="panel">
      <h2 className="font-bold">{template.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
      <PlaceholderList placeholders={template.placeholders} />
      <Textarea className="mt-4 min-h-56 font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-3 flex items-center gap-2">
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Salvar padrão</Button>
        {dirty && <Button variant="ghost" onClick={() => setBody(template.body)}><RotateCcw />Descartar</Button>}
      </div>
    </section>
  );
}

/** Um prompt visto pelo perfil ativo: herda o global ou tem override proprio. */
function ProfilePromptCard({ profileId, template, override, canEdit }: { profileId: string; template: PromptTemplate; override: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const inherited = override === null;
  const effective = override ?? template.body;
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(effective);
  useEffect(() => { setBody(effective); setEditing(false); }, [effective]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["prompt-overrides", profileId] });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profile_prompt_overrides")
        .upsert({ profile_id: profileId, key: template.key, body }, { onConflict: "profile_id,key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Override deste perfil salvo."); setEditing(false); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profile_prompt_overrides").delete().eq("profile_id", profileId).eq("key", template.key);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Voltou a herdar o padrão global."); setEditing(false); refresh(); },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{template.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${inherited ? "status-neutral" : "status-pink"}`}>
          {inherited ? "Herdando padrão global" : "Override deste perfil"}
        </span>
      </div>
      <PlaceholderList placeholders={template.placeholders} />
      <Textarea
        className="mt-4 min-h-56 font-mono text-xs leading-relaxed"
        value={editing ? body : effective}
        readOnly={!editing}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button disabled={save.isPending || body === effective} onClick={() => save.mutate()}>Salvar override</Button>
            <Button variant="ghost" onClick={() => { setBody(effective); setEditing(false); }}>Cancelar</Button>
          </>
        ) : (
          canEdit && <Button onClick={() => setEditing(true)}>Editar override</Button>
        )}
        {!inherited && canEdit && (
          <Button variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
            <RotateCcw />Voltar ao padrão global
          </Button>
        )}
      </div>
    </section>
  );
}

function ActiveProfilePrompts() {
  const { activeProfileId, activeProfile, can } = useStudio();
  const { data: templates = [], isLoading } = usePromptTemplates();
  const { data: overrides = [] } = usePromptOverrides(activeProfileId);
  const byKey = new Map(overrides.map((o) => [o.key, o.body]));
  const canEdit = can("perfis", "editar", activeProfileId);

  if (isLoading) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando prompts...</div>;

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Estes são os textos usados pelo perfil <strong className="text-foreground">{activeProfile?.name}</strong>. Sem override,
        ele segue o padrão global; ao editar, passa a usar a versão própria.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {templates.map((t) => (
          <ProfilePromptCard key={t.key} profileId={activeProfileId!} template={t} override={byKey.get(t.key) ?? null} canEdit={canEdit} />
        ))}
      </div>
    </>
  );
}

export function GlobalPromptsSettings() {
  const { data: templates = [], isLoading } = usePromptTemplates();
  if (isLoading) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando prompts...</div>;
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Valem como base ao criar novos perfis. Perfis existentes só recebem mudanças ao restaurar ou atualizar sua própria cópia.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {templates.map((t) => <TemplateCard key={t.key} template={t} />)}
      </div>
    </>
  );
}

export function PromptsPage() {
  const { isBackoffice, can, activeProfileId } = useStudio();

  // Trava de acesso direto pela URL: sem perfil visível e sem backoffice, nada é exibido.
  if (!isBackoffice && !can("perfis", "visualizar", activeProfileId)) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Você não tem acesso aos prompts.
      </div>
    );
  }

  if (!isBackoffice) {
    return (
      <>
        <Heading eyebrow="Prompts" title="Prompts do perfil" />
        <ProfileGate><ActiveProfilePrompts /></ProfileGate>
      </>
    );
  }

  return (
    <>
      <Heading eyebrow="Prompts" title="Prompts da inteligência artificial" />
      <Tabs defaultValue="perfil">
        <TabsList className="mb-5">
          <TabsTrigger value="perfil">Perfil ativo</TabsTrigger>
          <TabsTrigger value="global">Padrão global (vale para todos os perfis sem override)</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil">
          <ProfileGate><ActiveProfilePrompts /></ProfileGate>
        </TabsContent>
        <TabsContent value="global">
          <GlobalPromptsSettings />
        </TabsContent>
      </Tabs>
    </>
  );
}
