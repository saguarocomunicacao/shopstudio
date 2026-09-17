/**
 * Combobox multi-seleção (Popover + Command) com busca e scroll interno na lista.
 */
import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type MultiSelectOption = { value: string; label: string };

type Props = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Opções que, ao serem marcadas, desmarcam todas as outras (ex.: "Todos os perfis"). */
  exclusiveValues?: string[];
};

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecionar",
  searchPlaceholder = "Buscar...",
  emptyText = "Nada encontrado",
  className,
  exclusiveValues = [],
}: Props) {
  const [open, setOpen] = React.useState(false);

  const selecionadas = options.filter((o) => value.includes(o.value));
  const resumo =
    selecionadas.length === 0
      ? placeholder
      : selecionadas.length <= 2
        ? selecionadas.map((o) => o.label).join(", ")
        : `${selecionadas.length} selecionados`;

  const toggle = (opt: string) => {
    const jaTem = value.includes(opt);
    if (exclusiveValues.includes(opt)) {
      onChange(jaTem ? [] : [opt]);
      return;
    }
    const semExclusivas = value.filter((v) => !exclusiveValues.includes(v));
    onChange(jaTem ? semExclusivas.filter((v) => v !== opt) : [...semExclusivas, opt]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between gap-2 bg-background font-semibold", className)}
        >
          <span className="truncate text-left">{resumo}</span>
          <span className="flex shrink-0 items-center gap-1">
            {value.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar seleção"
                className="rounded-full p-0.5 text-muted-foreground hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange([]);
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const marcado = value.includes(opt.value);
                return (
                  <CommandItem key={opt.value} value={opt.label} onSelect={() => toggle(opt.value)}>
                    <span
                      className={cn(
                        "mr-2 grid h-4 w-4 shrink-0 place-items-center rounded border",
                        marcado ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {marcado && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {value.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => onChange([])}>
                Limpar seleção
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
