import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { salvarContextoCompradores } from "@/lib/comentarios.functions";

/** Bloco "Contexto dos compradores" do job: visível e editável; entra no prompt do roteirista. */
export function JobContextoCompradores({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarContextoCompradores);
  const q = useQuery({
    queryKey: ["job-contexto", jobId],
    queryFn: async () => {
      const { data } = await supabase.from("jobs").select("contexto_compradores").eq("id", jobId).maybeSingle();
      return (data?.contexto_compradores as string | null) ?? "";
    },
  });
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    if (!editando) setTexto(q.data ?? "");
  }, [q.data, editando]);
  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { jobId, texto } }),
    onSuccess: () => {
      toast.success("Contexto dos compradores salvo. Vale na próxima geração do roteiro.");
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["job-contexto", jobId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  if (!q.data && !editando) {
    if (!canEdit) return null;
    return (
      <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => setEditando(true)}>
        <Users />Adicionar contexto dos compradores
      </Button>
    );
  }
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4" />Contexto dos compradores</p>
        {canEdit && !editando && <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>Editar</Button>}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Objeções e dúvidas reais. O gancho responde a 1 objeção e o corpo cobre as 2 dúvidas mais comuns.</p>
      {editando ? (
        <div className="grid gap-2">
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(q.data ?? ""); }}>Cancelar</Button>
            <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm">{q.data}</p>
      )}
    </div>
  );
}
