import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAppConfig } from "@/lib/orcamento";

const CONFIG_KEY = "roteiro_usar_campeoes";
const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível salvar.");

/** Liga/desliga a referência de vídeos campeões usada pelo roteirista. */
export function ChampionRefsToggle() {
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const ativo = Number(config?.get(CONFIG_KEY)?.value_num ?? 1) > 0;

  const save = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("app_config")
        .upsert({ key: CONFIG_KEY, value_num: value ? 1 : 0 }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["app-config-all"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-background px-4 py-3">
      <div>
        <p className="text-sm font-semibold">Usar campeões do Kalodata como referência de roteiro</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Antes de escrever, busca os vídeos que mais venderam na categoria do produto e usa os ganchos como inspiração.
          A busca é reaproveitada por 24 h em cada categoria para economizar. Se falhar, o roteiro sai normalmente.
        </p>
      </div>
      <Switch checked={ativo} disabled={save.isPending} onCheckedChange={(v) => save.mutate(v)} aria-label="Usar campeões como referência" />
    </div>
  );
}
