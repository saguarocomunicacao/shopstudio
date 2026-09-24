import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type LightboxItem = { src: string; title?: string; caption?: ReactNode; fileName?: string };

type Props = {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  /** Ações extras por item (ex.: "Ir para este momento"). */
  actions?: (item: LightboxItem, index: number) => ReactNode;
};

async function baixarImagem(src: string, nome: string) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(src, "_blank", "noopener");
    toast.info("Abrimos a imagem em outra aba. Use \"Salvar imagem\" para baixar.");
  }
}

export function ImageLightbox({ items, index, onIndexChange, actions }: Props) {
  const open = index !== null && !!items[index];
  const total = items.length;
  const touchX = useRef<number | null>(null);
  const go = (d: number) => index !== null && total > 1 && onIndexChange((index + d + total) % total);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const item = open ? items[index!] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        className="flex max-h-[95vh] max-w-[min(95vw,1100px)] flex-col gap-3 overflow-hidden border-none bg-transparent p-0 shadow-none [&>button:last-child]:hidden"
        overlayClassName="bg-black/85"
      >
        <DialogTitle className="sr-only">{item?.title ?? "Imagem"}</DialogTitle>
        <DialogDescription className="sr-only">Use as setas para navegar e Esc para fechar.</DialogDescription>
        {item && (
          <>
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center"
              onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const x0 = touchX.current; touchX.current = null;
                const x1 = e.changedTouches[0]?.clientX;
                if (x0 == null || x1 == null) return;
                if (x1 - x0 > 50) go(-1); else if (x0 - x1 > 50) go(1);
              }}
            >
              <img src={item.src} alt={item.title ?? ""} className="max-h-[72vh] max-w-full rounded-lg object-contain" />
              {total > 1 && (
                <>
                  <Button type="button" size="icon" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full opacity-90" onClick={() => go(-1)} aria-label="Anterior"><ChevronLeft /></Button>
                  <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full opacity-90" onClick={() => go(1)} aria-label="Próxima"><ChevronRight /></Button>
                </>
              )}
              <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2 rounded-full opacity-90" onClick={() => onIndexChange(null)} aria-label="Fechar"><X /></Button>
            </div>
            <div className="mx-auto w-full max-w-2xl space-y-3 rounded-lg border border-border bg-card p-3 text-sm text-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                {total > 1 && <span className="text-xs text-muted-foreground">{index! + 1} de {total}</span>}
              </div>
              {item.caption && <div className="max-h-28 overflow-y-auto text-muted-foreground">{item.caption}</div>}
              <div className="flex flex-wrap gap-2">
                {actions?.(item, index!)}
                <Button type="button" variant="outline" size="sm" onClick={() => baixarImagem(item.src, item.fileName ?? "imagem.jpg")}><Download />Baixar imagem</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
