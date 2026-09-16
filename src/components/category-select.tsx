import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { syncCategories } from "@/lib/categories.functions";
import { useCategories } from "@/lib/content";
import { cn } from "@/lib/utils";
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

/** Combobox pesquisável das categorias oficiais; dispara a sync automática na primeira abertura (admin). */
export function CategorySelect({ id, value, onChange }: Props) {
  const { isAdmin } = useStudio();
  const { data: categories = [], isLoading } = useCategories();
  const sync = useSyncCategories();
  const tried = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading || tried.current) return;
    if (categories.length || !isAdmin) return;
    tried.current = true;
    sync.mutate();
  }, [isLoading, categories.length, isAdmin]);

  const busy = isLoading || sync.isPending;
  const selected = categories.find((c) => c.category_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between rounded-lg border-0 bg-input font-normal text-foreground hover:bg-input hover:text-foreground"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {busy ? "Carregando categorias..." : selected ? selected.category_name : "Selecione a categoria oficial"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {categories.map((c) => (
                <CommandItem
                  key={c.category_id}
                  value={c.category_name}
                  onSelect={() => {
                    onChange(c.category_id, c.category_name);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.category_id ? "opacity-100" : "opacity-0")} />
                  {c.category_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
