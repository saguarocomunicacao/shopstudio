import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { actionError } from "@/lib/api-keys";
import { ACAO_LABELS } from "@/lib/custo-core";

type Regra = "por_chamada" | "por_bloco_100_linhas" | "por_segundo";

type Taxa = {
  id: string;
  action_type: string;
  fornecedor: string;
  credito_por_unidade: number;
  regra: Regra;
  vigente_desde: string;
  ativo: boolean;
};

const REGRAS: { value: Regra; label: string }[] = [
  { value: "por_chamada", label: "Por chamada" },
  { value: "por_bloco_100_linhas", label: "Por bloco de 100 linhas" },
  { value: "por_segundo", label: "Por segundo" },
];

export function CreditoTaxasCard() {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<Record<string, { credito: string; regra: Regra; ativo: boolean }>>({});

  const { data: taxas = [], isLoading } = useQuery({
    queryKey: ["credito-taxas-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credito_taxas")
        .select("id, action_type, fornecedor, credito_por_unidade, regra, vigente_desde, ativo")
        .order("fornecedor")
        .order("action_type");
      if (error) throw new Error(error.message);
      return (data ?? []) as Taxa[];
    },
  });

  const { data: semTarifa = [] } = useQuery({
    queryKey: ["modelos-sem-tarifa"],
    queryFn: async () => {
      const [{ data: eventos }, { data: tarifas }] = await Promise.all([
        supabase.from("consumo_eventos").select("modelo, unidade").limit(2000),
        supabase.from("tarifas").select("modelo, tipo_unidade, ativo"),
      ]);
      const ativas = new Set(
        (tarifas ?? []).filter((t) => t.ativo).map((t) => `${t.modelo}|${t.tipo_unidade}`),
      );
      const faltando = new Set<string>();
      for (const e of eventos ?? []) {
        const chave = `${e.modelo}|${e.unidade}`;
        if (!ativas.has(chave)) faltando.add(chave);
      }
      return [...faltando];
    },
  });

  useEffect(() => {
    setRascunho(
      Object.fromEntries(
        taxas.map((t) => [
          t.id,
          { credito: String(t.credito_por_unidade), regra: t.regra, ativo: t.ativo },
        ]),
      ),
    );
  }, [taxas]);

  const salvar = useMutation({
    mutationFn: async (taxa: Taxa) => {
      const edit = rascunho[taxa.id];
      if (!edit) throw new Error("Nada para salvar.");
      const credito = Number(String(edit.credito ?? "").replace(",", "."));
      if (!Number.isFinite(credito) || credito < 0) throw new Error("Informe um número válido.");
      const { error } = await supabase
        .from("credito_taxas")
        .update({ credito_por_unidade: credito, regra: edit.regra, ativo: edit.ativo })
        .eq("id", taxa.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Taxa de crédito salva.");
      qc.invalidateQueries({ queryKey: ["credito-taxas-admin"] });
      qc.invalidateQueries({ queryKey: ["credito-taxas"] });
    },
    onError: (e) => toast.error(actionError(e, "Não foi possível salvar.")),
  });

  return (
    <div className="grid gap-4">
      <section className="panel grid gap-3">
        <div>
          <h2 className="text-base font-black">Créditos por ação</h2>
          <p className="text-xs text-muted-foreground">
            Quanto cada ação desconta da carteira do fornecedor (pontos Kalodata, créditos JSON2Video). Quando a API do
            fornecedor devolve o consumo real, o valor real tem prioridade sobre esta taxa.
          </p>
        </div>

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-2">
            {taxas.map((t) => {
              const edit = rascunho[t.id];
              if (!edit) return null;
              return (
                <div key={t.id} className="grid items-end gap-2 rounded-xl bg-secondary p-3 sm:grid-cols-[1fr_120px_200px_auto_auto]">
                  <div>
                    <p className="text-sm font-bold">{ACAO_LABELS[t.action_type as keyof typeof ACAO_LABELS] ?? t.action_type}</p>
                    <p className="text-xs text-muted-foreground">{t.fornecedor}</p>
                  </div>
                  <Input
                    value={edit.credito}
                    onChange={(e) => setRascunho((r) => ({ ...r, [t.id]: { ...edit, credito: e.target.value } }))}
                    inputMode="decimal"
                  />
                  <Select
                    value={edit.regra}
                    onValueChange={(v) => setRascunho((r) => ({ ...r, [t.id]: { ...edit, regra: v as Regra } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGRAS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={edit.ativo}
                      onCheckedChange={(v) => setRascunho((r) => ({ ...r, [t.id]: { ...edit, ativo: v } }))}
                    />
                    <span className="text-xs text-muted-foreground">ativa</span>
                  </div>
                  <Button size="sm" onClick={() => salvar.mutate(t)} disabled={salvar.isPending}>
                    Salvar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {semTarifa.length > 0 && (
        <section className="panel grid gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h2 className="text-base font-black">Modelos sem tarifa ativa</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Estes consumos estão sendo calculados como R$ 0. Cadastre uma tarifa para cada um.
          </p>
          <ul className="grid gap-1 text-sm">
            {semTarifa.map((chave) => (
              <li key={chave} className="font-mono text-xs">{chave.replace("|", " · ")}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
