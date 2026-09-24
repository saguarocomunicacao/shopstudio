import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { actionError } from "@/lib/api-keys";

type Unidade =
  | "imagem"
  | "segundo_video"
  | "credito_montagem"
  | "bloco_linhas_kalodata"
  | "token_input"
  | "token_output"
  | "mil_caracteres"
  | "minuto_audio";

type Tarifa = {
  id: string;
  tipo_unidade: Unidade;
  modelo: string;
  preco_unitario: number;
  moeda: "USD" | "BRL";
  vigente_desde: string;
  ativo: boolean;
};

const UNIDADES: { value: Unidade; label: string }[] = [
  { value: "imagem", label: "Por imagem" },
  { value: "segundo_video", label: "Por segundo de vídeo" },
  { value: "credito_montagem", label: "Por crédito de montagem" },
  { value: "bloco_linhas_kalodata", label: "Por 100 linhas de busca" },
  { value: "token_input", label: "Por token de entrada (texto)" },
  { value: "token_output", label: "Por token de saída (texto)" },
  { value: "mil_caracteres", label: "Por mil caracteres (narração)" },
  { value: "minuto_audio", label: "Por minuto de áudio (ditado por voz)" },
];

const errMessage = (e: unknown) => actionError(e, "Não foi possível salvar.");

export function TarifasCard() {
  const qc = useQueryClient();

  const { data: tarifas = [], isLoading } = useQuery({
    queryKey: ["tarifas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarifas")
        .select("id, tipo_unidade, modelo, preco_unitario, preco_exato, moeda, vigente_desde, ativo")
        .order("tipo_unidade")
        .order("vigente_desde", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((t) => ({ ...t, preco_unitario: Number(t.preco_exato ?? t.preco_unitario) })) as Tarifa[];
    },
  });

  const { data: cotacao } = useQuery({
    queryKey: ["app-config", "cotacao_usd_brl"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("value_num")
        .eq("key", "cotacao_usd_brl")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Number(data?.value_num ?? 0);
    },
  });

  const [cotacaoInput, setCotacaoInput] = useState("");
  useEffect(() => {
    if (cotacao !== undefined) setCotacaoInput(String(cotacao));
  }, [cotacao]);

  const saveCotacao = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase
        .from("app_config")
        .upsert({ key: "cotacao_usd_brl", value_num: value }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cotação atualizada.");
      qc.invalidateQueries({ queryKey: ["app-config", "cotacao_usd_brl"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const saveTarifa = useMutation({
    mutationFn: async (t: Partial<Tarifa> & { id?: string }) => {
      if (t.id) {
        const { id, ...rest } = t;
        const patch = rest.preco_unitario !== undefined ? { ...rest, preco_exato: rest.preco_unitario } : rest;
        const { error } = await supabase.from("tarifas").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("tarifas").insert({
          tipo_unidade: t.tipo_unidade ?? "imagem",
          modelo: t.modelo ?? "",
          preco_unitario: t.preco_unitario ?? 0,
          preco_exato: t.preco_unitario ?? 0,
          moeda: t.moeda ?? "USD",
          vigente_desde: t.vigente_desde ?? new Date().toISOString().slice(0, 10),
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarifas"] }),
    onError: (e) => toast.error(errMessage(e)),
  });

  const removeTarifa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarifas").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Tarifa removida.");
      qc.invalidateQueries({ queryKey: ["tarifas"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <section className="panel lg:col-span-2">
      <h2 className="font-bold">Tarifas de custo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Preços pagos a cada fornecedor. Vale a tarifa vigente na data em que o consumo aconteceu.
      </p>

      <div className="mt-5 grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <Input
          inputMode="decimal"
          value={cotacaoInput}
          onChange={(e) => setCotacaoInput(e.target.value)}
          placeholder="Cotação do dólar (R$ por US$)"
        />
        <Button
          variant="secondary"
          disabled={saveCotacao.isPending}
          onClick={() => {
            const value = Number(cotacaoInput.replace(",", "."));
            if (!Number.isFinite(value) || value <= 0) {
              toast.error("Informe uma cotação válida.");
              return;
            }
            saveCotacao.mutate(value);
          }}
        >
          Salvar cotação
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando tarifas...
          </p>
        )}
        {tarifas.map((t) => (
          <TarifaRow
            key={t.id}
            tarifa={t}
            onSave={(patch) => saveTarifa.mutate({ id: t.id, ...patch })}
            onRemove={() => removeTarifa.mutate(t.id)}
          />
        ))}
      </div>

      <Button
        variant="secondary"
        className="mt-4"
        disabled={saveTarifa.isPending}
        onClick={() => saveTarifa.mutate({ tipo_unidade: "imagem", modelo: "novo-modelo", preco_unitario: 0 })}
      >
        <Plus />
        Nova tarifa
      </Button>
    </section>
  );
}

function TarifaRow({
  tarifa,
  onSave,
  onRemove,
}: {
  tarifa: Tarifa;
  onSave: (patch: Partial<Tarifa>) => void;
  onRemove: () => void;
}) {
  const [modelo, setModelo] = useState(tarifa.modelo);
  const [preco, setPreco] = useState(String(tarifa.preco_unitario));

  useEffect(() => {
    setModelo(tarifa.modelo);
    setPreco(String(tarifa.preco_unitario));
  }, [tarifa.modelo, tarifa.preco_unitario]);

  return (
    <div className="grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px_90px_140px_auto_auto] md:items-center">
      <Input value={modelo} onChange={(e) => setModelo(e.target.value)} onBlur={() => modelo !== tarifa.modelo && onSave({ modelo })} placeholder="Modelo" />
      <Select value={tarifa.tipo_unidade} onValueChange={(v) => onSave({ tipo_unidade: v as Unidade })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {UNIDADES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        inputMode="decimal"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        onBlur={() => {
          const value = Number(preco.replace(",", "."));
          if (Number.isFinite(value) && value !== tarifa.preco_unitario) onSave({ preco_unitario: value });
        }}
      />
      <Select value={tarifa.moeda} onValueChange={(v) => onSave({ moeda: v as "USD" | "BRL" })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="USD">USD</SelectItem>
          <SelectItem value="BRL">BRL</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" value={tarifa.vigente_desde} onChange={(e) => onSave({ vigente_desde: e.target.value })} />
      <div className="flex items-center gap-2">
        <Switch checked={tarifa.ativo} onCheckedChange={(v) => onSave({ ativo: v })} />
        <span className="text-xs text-muted-foreground">{tarifa.ativo ? "Ativa" : "Inativa"}</span>
      </div>
      <Button variant="ghost" size="icon" aria-label="Remover tarifa" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}
