import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePromptTemplates, type PromptTemplate } from "@/lib/prompts";
import { useStudio } from "./studio-context";

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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
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

export function PromptsPage() {
  const { isAdmin } = useStudio();
  const { data: templates = [], isLoading } = usePromptTemplates();

  if (!isAdmin) {
    return <><Heading eyebrow="Acesso restrito" title="Prompts do sistema" /><div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Só administradores podem editar os prompts padrão.</div></>;
  }

  return (
    <>
      <Heading eyebrow="Padrão global" title="Prompts do sistema" />
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Estes são os textos que a inteligência artificial recebe em cada etapa. O que estiver entre chaves é trocado
        pelos dados reais na hora de gerar. Cada perfil pode ter a sua própria versão; os que não tiverem seguem o padrão daqui.
      </p>
      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando prompts...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {templates.map((t) => <TemplateCard key={t.key} template={t} />)}
        </div>
      )}
    </>
  );
}
