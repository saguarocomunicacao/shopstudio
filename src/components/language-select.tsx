import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LANGUAGE_OPTIONS } from "@/lib/content";
import { cn } from "@/lib/utils";

type Props = { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean };

/** Combobox pesquisável de idiomas suportados pelo Kalodata. */
export function LanguageSelect({ id, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = LANGUAGE_OPTIONS.find((l) => l.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between rounded-lg border-0 bg-input font-normal text-foreground hover:bg-input hover:text-foreground"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.flag} ${selected.label}` : "Selecione o idioma"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar idioma..." />
          <CommandList>
            <CommandEmpty>Nenhum idioma encontrado.</CommandEmpty>
            <CommandGroup>
              {LANGUAGE_OPTIONS.map((l) => (
                <CommandItem
                  key={l.value}
                  value={`${l.label} ${l.value}`}
                  onSelect={() => {
                    onChange(l.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === l.value ? "opacity-100" : "opacity-0")} />
                  <span className="mr-1.5">{l.flag}</span>
                  {l.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
