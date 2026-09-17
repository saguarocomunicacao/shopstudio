import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/custo";
import { CONFIG_KEYS, useAppConfig, useGastoMes } from "@/lib/orcamento";
import { useStudio } from "./studio-context";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível salvar.");

function useSaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: number | null }) => {
      const { error } = await supabase.from("app_config").upsert({ key, value_num: value }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["app-config-all"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });
}

function NumberField({
  label,
  hint,
  value,
  onSave,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <div className="min-w-40 flex-1">
      <p className="mb-1 text-xs font-semibold">{label}</p>
      <Input
        inputMode="decimal"
        placeholder="sem limite"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const raw = text.trim().replace(",", ".");
          const n = raw === "" ? null : Number(raw);
          if (raw !== "" && (!Number.isFinite(n) || (n as number) < 0)) {
            toast.error("Informe um valor válido.");
            return;
          }
          if ((n ?? null) !== value) onSave(n ?? null);
        }}
        className="bg-background"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Teto de orçamento mensal e saldo anotado dos fornecedores. Somente admin. */
export function BudgetCard() {
  const { profiles, activeProfileId } = useStudio();
  const { data: config } = useAppConfig();
  const gasto = useGastoMes(activeProfileId);
  const save = useSaveConfig();

  const numOf = (key: string) => {
    const v = config?.get(key)?.value_num;
    return v === null || v === undefined ? null : Number(v);
  };
  const bloqueiaTudo = Number(config?.get(CONFIG_KEYS.bloqueioTotal)?.value_num ?? 0) === 1;

  const saldoBaixo = (atual: string, minimo: string) => {
    const a = numOf(atual);
    const m = numOf(minimo);
    return a !== null && m !== null && a <= m;
  };

  return (
    <>
      <section className="panel lg:col-span-2">
        <h2 className="font-bold">Orçamento de custo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Teto mensal de gasto. Em 80% aparece um aviso; ao atingir 100% novas gerações de vídeo ficam bloqueadas.
        </p>

        {gasto && (
          <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">
            Gasto deste mês: <strong>{brl(gasto.globalBrl)}</strong> no total
            {activeProfileId && <> · <strong>{brl(gasto.perfilBrl)}</strong> no perfil ativo</>}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <NumberField
            label="Orçamento mensal geral (R$)"
            value={numOf(CONFIG_KEYS.tetoGlobal)}
            onSave={(v) => save.mutate({ key: CONFIG_KEYS.tetoGlobal, value: v })}
          />
        </div>

        <div className="mt-5 grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Orçamento por perfil (opcional)
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {profiles.map((p) => (
              <NumberField
                key={p.id}
                label={p.name}
                value={numOf(CONFIG_KEYS.perfil(p.id))}
                onSave={(v) => save.mutate({ key: CONFIG_KEYS.perfil(p.id), value: v })}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-secondary px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Bloquear tudo ao estourar o teto</p>
            <p className="text-xs text-muted-foreground">
              Desligado, só a geração de vídeo (a etapa cara) é bloqueada. Ligado, imagens e buscas também param.
            </p>
          </div>
          <Switch
            checked={bloqueiaTudo}
            onCheckedChange={(v) => save.mutate({ key: CONFIG_KEYS.bloqueioTotal, value: v ? 1 : 0 })}
          />
        </div>
      </section>

      <section className="panel lg:col-span-2">
        <h2 className="font-bold">Saldo dos fornecedores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Google (Gemini/Veo) não informa saldo em tempo real — ali valem a estimativa e o teto de orçamento. JSON2Video e
          Kalodata não expõem saldo pela API, então anote aqui o valor atual só como referência.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">JSON2Video (créditos)</p>
            <div className="mt-3 flex gap-3">
              <NumberField
                label="Saldo atual"
                value={numOf(CONFIG_KEYS.saldoJson2video)}
                onSave={(v) => save.mutate({ key: CONFIG_KEYS.saldoJson2video, value: v })}
              />
              <NumberField
                label="Avisar abaixo de"
                value={numOf(CONFIG_KEYS.saldoJson2videoMin)}
                onSave={(v) => save.mutate({ key: CONFIG_KEYS.saldoJson2videoMin, value: v })}
              />
            </div>
            {saldoBaixo(CONFIG_KEYS.saldoJson2video, CONFIG_KEYS.saldoJson2videoMin) && (
              <p className="mt-2 text-xs font-semibold text-destructive">Saldo baixo: recarregue antes de montar novos vídeos.</p>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">Kalodata (pontos)</p>
            <div className="mt-3 flex gap-3">
              <NumberField
                label="Saldo atual"
                value={numOf(CONFIG_KEYS.saldoKalodata)}
                onSave={(v) => save.mutate({ key: CONFIG_KEYS.saldoKalodata, value: v })}
              />
              <NumberField
                label="Avisar abaixo de"
                value={numOf(CONFIG_KEYS.saldoKalodataMin)}
                onSave={(v) => save.mutate({ key: CONFIG_KEYS.saldoKalodataMin, value: v })}
              />
            </div>
            {saldoBaixo(CONFIG_KEYS.saldoKalodata, CONFIG_KEYS.saldoKalodataMin) && (
              <p className="mt-2 text-xs font-semibold text-destructive">Saldo baixo: recarregue antes de novas buscas.</p>
            )}
          </div>
        </div>

        <Button variant="secondary" className="mt-4" disabled={save.isPending} onClick={() => toast.info("Os valores são salvos ao sair do campo.")}>
          Como funciona
        </Button>
      </section>
    </>
  );
}
