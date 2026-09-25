import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { setLerComentariosCampeoes } from "@/lib/comentarios.functions";
import { custoEstimadoUsd } from "@/lib/comentarios-schema";

/** Aba Publicação do perfil: "Ler comentários dos campeões ao gerar roteiro". Salva na hora. */
export function LerComentariosToggle({ profileId, disabled }: { profileId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const salvar = useServerFn(setLerComentariosCampeoes);
  const q = useQuery({
    queryKey: ["ler-comentarios-campeoes", profileId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ler_comentarios_campeoes").eq("id", profileId).maybeSingle();
      return !!data?.ler_comentarios_campeoes;
    },
  });
  const m = useMutation({
    mutationFn: (ligado: boolean) => salvar({ data: { profileId, ligado } }),
    onSuccess: (_r, ligado) => {
      toast.success(ligado ? "Os próximos roteiros por campeões vão ler os comentários." : "Leitura automática de comentários desligada.");
      qc.invalidateQueries({ queryKey: ["ler-comentarios-campeoes", profileId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  const extra = (custoEstimadoUsd(50) * 3).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t py-4">
      <div>
        <p className="text-sm font-semibold">Ler comentários dos campeões ao gerar roteiro</p>
        <p className="text-xs text-muted-foreground">
          Lê 50 comentários dos 3 vídeos campeões da categoria e usa as objeções e dúvidas no roteiro. Custo extra estimado: até US$ {extra} por roteiro (vídeos lidos nos últimos 7 dias não são cobrados de novo).
        </p>
      </div>
      <Switch checked={!!q.data} disabled={disabled || q.isLoading || m.isPending} onCheckedChange={(v) => m.mutate(v)} aria-label="Ler comentários dos campeões ao gerar roteiro" />
    </div>
  );
}
