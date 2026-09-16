import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { syncCategories } from "@/lib/categories.functions";
import { useCategories } from "@/lib/content";
import { useStudio } from "./studio-context";

const errMessage = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível atualizar as categorias.");

/** Sincroniza as categorias oficiais do TikTok Shop (somente admin). */
export function useSyncCategories() {
  const qc = useQueryClient();
  const run = useServerFn(syncCategories);
  return useMutation({
    mutationFn: async () => (await run({})) as { count: number },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success(`${data.count} categorias oficiais atualizadas.`);
    },
    onError: (e) => toast.error(errMessage(e)),
  });
}

export function SyncCategoriesButton() {
  const sync = useSyncCategories();
  return (
    <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
      {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Atualizar categorias
    </Button>
  );
}

type Props = { id?: string; value: string; onChange: (categoryId: string, categoryName: string) => void };

/** Select das categorias oficiais; dispara a sync automática na primeira abertura (admin). */
export function CategorySelect({ id, value, onChange }: Props) {
  const { isAdmin } = useStudio();
  const { data: categories = [], isLoading } = useCategories();
  const sync = useSyncCategories();
  const tried = useRef(false);

  useEffect(() => {
    if (isLoading || tried.current) return;
    if (categories.length || !isAdmin) return;
    tried.current = true;
    sync.mutate();
  }, [isLoading, categories.length, isAdmin]);

  const busy = isLoading || sync.isPending;

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v, categories.find((c) => c.category_id === v)?.category_name ?? "")}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={busy ? "Carregando categorias..." : "Selecione a categoria oficial"} />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
