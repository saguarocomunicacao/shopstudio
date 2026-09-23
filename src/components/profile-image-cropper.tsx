import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

type Crop = { x: number; y: number };

export function ProfileImageCropper({ source, open, saving, onOpenChange, onSave }: { source: string | null; open: boolean; saving: boolean; onOpenChange: (open: boolean) => void; onSave: (base64: string) => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; crop: Crop } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }, [open, source]);

  const baseScale = Math.max(320 / natural.width, 320 / natural.height);
  const renderedWidth = natural.width * baseScale * zoom;
  const renderedHeight = natural.height * baseScale * zoom;
  const limitX = Math.max(0, (renderedWidth - 320) / 2);
  const limitY = Math.max(0, (renderedHeight - 320) / 2);
  const clamp = (next: Crop): Crop => ({ x: Math.max(-limitX, Math.min(limitX, next.x)), y: Math.max(-limitY, Math.min(limitY, next.y)) });

  useEffect(() => setCrop((current) => clamp(current)), [zoom, natural.width, natural.height]);

  const save = () => {
    const image = imageRef.current;
    if (!image) return;
    const output = 512;
    const displayScale = baseScale * zoom;
    const sourceSize = 320 / displayScale;
    const sourceX = natural.width / 2 - sourceSize / 2 - crop.x / displayScale;
    const sourceY = natural.height / 2 - sourceSize / 2 - crop.y / displayScale;
    const canvas = document.createElement("canvas");
    canvas.width = output;
    canvas.height = output;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.arc(output / 2, output / 2, output / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, output, output);
    onSave(canvas.toDataURL("image/png", 0.92).split(",")[1] ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Ajustar foto do perfil</DialogTitle><DialogDescription>Posicione a foto dentro do círculo. Esta imagem aparece apenas na interface do app.</DialogDescription></DialogHeader>
        {source ? (
          <div className="grid gap-5">
            <div
              className="relative mx-auto size-80 max-w-full touch-none overflow-hidden rounded-full bg-muted ring-4 ring-background shadow-lg"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, crop }; }}
              onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; setCrop(clamp({ x: drag.crop.x + event.clientX - drag.startX, y: drag.crop.y + event.clientY - drag.startY })); }}
              onPointerUp={() => { dragRef.current = null; }}
            >
              <img ref={imageRef} src={source} alt="Prévia do recorte" draggable={false} onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="absolute left-1/2 top-1/2 max-w-none select-none" style={{ width: renderedWidth, height: renderedHeight, transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))` }} />
              <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-foreground/20" />
              <span className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[11px] font-semibold text-foreground"><Move className="size-3" />Arraste</span>
            </div>
            <div className="grid gap-2"><span className="text-xs font-semibold">Zoom</span><Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={(value) => setZoom(value[0] ?? 1)} aria-label="Zoom da foto" /></div>
          </div>
        ) : <div className="grid min-h-56 place-items-center text-muted-foreground"><ImagePlus /></div>}
        <DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="button" onClick={save} disabled={!source || saving}>{saving ? <Loader2 className="animate-spin" /> : null}Salvar foto</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}