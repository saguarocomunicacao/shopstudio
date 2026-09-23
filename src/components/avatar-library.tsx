import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { actionError } from "@/lib/api-keys";
import { deleteProfileAvatar, saveProfileAvatar, setJobAvatar, slugifyTag, MAX_AVATAR_FILE_BYTES, MAX_AVATAR_IMAGES } from "@/lib/avatars.functions";

const errMessage = (e: unknown) => actionError(e, "Não foi possível concluir a ação.");

export type AvatarPhoto = { preview: string; url?: string; base64?: string; mimeType?: string };

export type LibraryAvatar = {
  id: string;
  name: string;
  tag: string;
  description: string;
  reference_urls: string[];
  primary_url: string | null;
};

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const readPhoto = (file: File) =>
  new Promise<AvatarPhoto>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ preview: result, base64: result.split(",")[1] ?? "", mimeType: file.type });
    };
    reader.readAsDataURL(file);
  });

const toPayload = (photos: AvatarPhoto[]) =>
  photos.map((p) => (p.base64 ? { base64: p.base64, mimeType: p.mimeType! } : { url: p.url! }));

/** Avatares salvos de um perfil. */
export function useProfileAvatars(profileId: string | null) {
  return useQuery({
    queryKey: ["profile-avatars", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<LibraryAvatar[]> => {
      const { data, error } = await supabase
        .from("profile_avatars")
        .select("id, name, tag, description, reference_urls, primary_url")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        tag: row.tag ?? "",
        description: row.description ?? "",
        reference_urls: Array.isArray(row.reference_urls)
          ? (row.reference_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
          : [],
        primary_url: row.primary_url ?? null,
      }));
    },
  });
}

/** Fotos + descrição: bloco reutilizado na biblioteca e na geração do vídeo. */
export function AvatarPhotosField({
  photos,
  onChange,
  disabled,
  primaryIndex,
  onPrimaryChange,
}: {
  photos: AvatarPhoto[];
  onChange: (photos: AvatarPhoto[]) => void;
  disabled?: boolean;
  primaryIndex?: number;
  onPrimaryChange?: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const free = MAX_AVATAR_IMAGES - photos.length;
    if (free <= 0) {
      toast.error(`Máximo de ${MAX_AVATAR_IMAGES} fotos.`);
      return;
    }
    const valid = list.filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_AVATAR_FILE_BYTES).slice(0, free);
    if (valid.length < list.length) toast.error("Algumas fotos foram ignoradas (use JPG ou PNG de até 15 MB).");
    const read = await Promise.all(valid.map(readPhoto));
    onChange([...photos, ...read]);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, i) => (
          <div key={photo.url ?? i} className="relative">
            <img
              src={photo.preview}
              alt=""
              className={`size-20 rounded-xl object-cover ${onPrimaryChange && primaryIndex === i ? "ring-2 ring-primary ring-offset-2" : ""}`}
            />
            <button
              type="button"
              aria-label="Remover foto"
              disabled={disabled}
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow"
              onClick={() => {
                onChange(photos.filter((_, idx) => idx !== i));
                if (onPrimaryChange && primaryIndex !== undefined && primaryIndex >= i) {
                  onPrimaryChange(Math.max(0, primaryIndex - (primaryIndex === i ? primaryIndex : 1)));
                }
              }}
            >
              <X className="size-3.5" />
            </button>
            {onPrimaryChange && (
              <button
                type="button"
                aria-label="Marcar como foto principal"
                title="Foto principal"
                disabled={disabled}
                className={`absolute -left-2 -top-2 grid size-6 place-items-center rounded-full border bg-background shadow ${primaryIndex === i ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => onPrimaryChange(i)}
              >
                <Star className={`size-3.5 ${primaryIndex === i ? "fill-current" : ""}`} />
              </button>
            )}
          </div>
        ))}
        {photos.length < MAX_AVATAR_IMAGES && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="grid size-20 place-items-center rounded-xl border border-dashed text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { void pick(e.target.files); e.target.value = ""; }}
      />
      <p className="text-xs text-muted-foreground">Até {MAX_AVATAR_IMAGES} fotos da mesma pessoa, JPG ou PNG de até 15 MB.</p>
    </div>
  );
}

export function AvatarFormDialog({
  open,
  profileId,
  avatar,
  onOpenChange,
  initialTag,
  onSaved,
}: {
  open: boolean;
  profileId: string;
  avatar: LibraryAvatar | null;
  onOpenChange: (open: boolean) => void;
  initialTag?: string;
  onSaved?: (tag: string) => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveProfileAvatar);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [tagTocada, setTagTocada] = useState(false);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<AvatarPhoto[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(avatar?.name ?? "");
    setTag(avatar?.tag ?? initialTag ?? "");
    setTagTocada(!!(avatar?.tag || initialTag));
    setDescription(avatar?.description ?? "");
    const urls = avatar?.reference_urls ?? [];
    setPhotos(urls.map((url) => ({ preview: url, url })));
    const idx = avatar?.primary_url ? urls.indexOf(avatar.primary_url) : 0;
    setPrimaryIndex(idx >= 0 ? idx : 0);
  }, [open, avatar, initialTag]);

  const tagFinal = slugifyTag(tagTocada && tag ? tag : name);

  const run = useMutation({
    mutationFn: async () =>
      save({
        data: {
          profileId,
          avatarId: avatar?.id,
          name: name.trim(),
          tag: tagFinal,
          description: description.trim(),
          images: toPayload(photos),
          primaryIndex: Math.min(primaryIndex, Math.max(0, photos.length - 1)),
        },
      }),
    onSuccess: async (res) => {
      toast.success(avatar ? "Avatar atualizado." : "Avatar salvo na biblioteca.");
      await qc.invalidateQueries({ queryKey: ["profile-avatars"] });
      onSaved?.(res?.tag ?? tagFinal);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{avatar ? "Editar avatar" : "Novo avatar"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="av-name">Nome do avatar</Label>
            <Input id="av-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana, apresentadora" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="av-tag">Etiqueta</Label>
            <Input
              id="av-tag"
              value={tagTocada ? tag : tagFinal}
              onChange={(e) => { setTagTocada(true); setTag(e.target.value); }}
              placeholder="ana"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="rounded bg-secondary px-1">{`{{${tagFinal || "etiqueta"}}}`}</code> na descrição da cena para
              colocar esta pessoa na imagem. Só letras, números e _, sem espaço nem acento.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Fotos de referência <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <AvatarPhotosField
              photos={photos}
              onChange={setPhotos}
              disabled={run.isPending}
              primaryIndex={primaryIndex}
              onPrimaryChange={setPrimaryIndex}
            />
            <p className="text-xs text-muted-foreground">
              A estrela marca a foto principal, usada nas cenas com mais de uma pessoa.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="av-desc">Descrição <span className="font-normal text-muted-foreground">(usada quando não há fotos)</span></Label>
            <Textarea
              id="av-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="mulher, loira, cerca de 30 anos, sorridente"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={run.isPending || name.trim().length < 2} onClick={() => run.mutate()}>
            {run.isPending && <Loader2 className="animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aba "Meus avatares": biblioteca reutilizável do perfil. */
export function ProfileAvatarsCard({ profileId }: { profileId: string | null }) {
  const qc = useQueryClient();
  const remove = useServerFn(deleteProfileAvatar);
  const { data: avatars = [], isLoading } = useProfileAvatars(profileId);
  const [editing, setEditing] = useState<LibraryAvatar | null>(null);
  const [open, setOpen] = useState(false);

  const runRemove = useMutation({
    mutationFn: async (avatarId: string) => remove({ data: { avatarId } }),
    onSuccess: () => {
      toast.success("Avatar removido.");
      qc.invalidateQueries({ queryKey: ["profile-avatars"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  if (!profileId) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Salve o perfil antes de criar avatares.</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">Meus avatares</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avatares extras deste perfil. O avatar principal continua sendo o padrão; estes ficam disponíveis na hora de gerar um vídeo.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Novo avatar</Button>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>
      ) : avatars.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum avatar salvo ainda. Crie um com fotos ou só com a descrição.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {avatars.map((avatar) => (
            <li key={avatar.id} className="flex gap-3 rounded-xl border p-3">
              {avatar.primary_url || avatar.reference_urls[0] ? (
                <img src={avatar.primary_url ?? avatar.reference_urls[0]} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><UserRound className="size-6" /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{avatar.name}</p>
                {avatar.tag && (
                  <p className="mt-0.5 text-xs">
                    <code className="rounded bg-secondary px-1 font-bold">{`{{${avatar.tag}}}`}</code>{" "}
                    <span className="text-muted-foreground">use nas cenas</span>
                  </p>
                )}
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {avatar.reference_urls.length
                    ? `${avatar.reference_urls.length} foto(s) de referência`
                    : avatar.description || "Sem descrição"}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(avatar); setOpen(true); }}><Pencil className="size-3.5" />Editar</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={runRemove.isPending}
                    onClick={() => runRemove.mutate(avatar.id)}
                  >
                    <Trash2 className="size-3.5" />Remover
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AvatarFormDialog open={open} profileId={profileId} avatar={editing} onOpenChange={setOpen} />
    </div>
  );
}

type JobAvatarRow = { avatar_id: string | null; avatar_reference_urls: unknown; avatar_description: string | null };

/** Escolha do avatar usado SOMENTE neste vídeo (não altera o perfil). */
export function JobAvatarSelect({ jobId, profileId, canEdit }: { jobId: string; profileId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const apply = useServerFn(setJobAvatar);
  const { data: avatars = [] } = useProfileAvatars(profileId);

  const { data: atual } = useQuery({
    queryKey: ["job-avatar", jobId],
    queryFn: async (): Promise<JobAvatarRow | null> => {
      const { data, error } = await supabase
        .from("jobs")
        .select("avatar_id, avatar_reference_urls, avatar_description")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as JobAvatarRow | null;
    },
  });

  const urls = Array.isArray(atual?.avatar_reference_urls)
    ? (atual!.avatar_reference_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
    : [];
  const temOverride = urls.length > 0 || !!atual?.avatar_description;

  const [modo, setModo] = useState<"perfil" | "biblioteca" | "novo">("perfil");
  const [avatarId, setAvatarId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<AvatarPhoto[]>([]);
  const [salvar, setSalvar] = useState(false);

  useEffect(() => {
    if (!atual) return;
    if (atual.avatar_id) { setModo("biblioteca"); setAvatarId(atual.avatar_id); return; }
    if (temOverride) {
      setModo("novo");
      setDescription(atual.avatar_description ?? "");
      setPhotos(urls.map((url) => ({ preview: url, url })));
    }
  }, [atual?.avatar_id, temOverride]);

  const run = useMutation({
    mutationFn: async () =>
      apply({
        data: {
          jobId,
          modo,
          avatarId: modo === "biblioteca" ? avatarId : undefined,
          name: name.trim(),
          description: modo === "novo" ? description.trim() : "",
          images: modo === "novo" ? toPayload(photos) : [],
          salvarNaBiblioteca: modo === "novo" && salvar,
        },
      }),
    onSuccess: () => {
      toast.success("Avatar deste vídeo atualizado.");
      setSalvar(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["job-avatar", jobId] });
      qc.invalidateQueries({ queryKey: ["profile-avatars"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-black">Avatar deste vídeo</p>
        <p className="mt-1 text-xs text-muted-foreground">Vale só para este vídeo. O avatar principal do perfil não muda.</p>
      </div>

      <div className="grid gap-2">
        {([
          ["perfil", "Usar o avatar do perfil (padrão)"],
          ["biblioteca", "Escolher um avatar salvo"],
          ["novo", "Criar um avatar novo"],
        ] as const).map(([value, label]) => (
          <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${modo === value ? "border-primary bg-primary/5 font-semibold" : ""}`}>
            <input
              type="radio"
              name={`avatar-modo-${jobId}`}
              checked={modo === value}
              disabled={!canEdit}
              onChange={() => setModo(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {modo === "biblioteca" && (
        avatars.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {avatars.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setAvatarId(a.id)}
                className={`flex items-center gap-3 rounded-lg border p-2 text-left ${avatarId === a.id ? "border-primary bg-primary/5" : ""}`}
              >
                {a.reference_urls[0] ? (
                  <img src={a.reference_urls[0]} alt="" className="size-12 rounded-md object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-md bg-secondary text-muted-foreground"><UserRound className="size-5" /></span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.reference_urls.length ? `${a.reference_urls.length} foto(s)` : a.description || "Descrição"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum avatar salvo neste perfil ainda. Crie um novo abaixo e marque "salvar na biblioteca".
          </p>
        )
      )}

      {modo === "novo" && (
        <div className="grid gap-3">
          <AvatarPhotosField photos={photos} onChange={setPhotos} disabled={!canEdit || run.isPending} />
          <div className="grid gap-2">
            <Label htmlFor={`av-desc-${jobId}`}>Descrição <span className="font-normal text-muted-foreground">(usada quando não há fotos)</span></Label>
            <Textarea
              id={`av-desc-${jobId}`}
              rows={2}
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="mulher, loira, cerca de 30 anos, sorridente"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2">
            <Label htmlFor={`av-save-${jobId}`} className="text-xs font-semibold">Salvar este avatar em Meus avatares para reusar depois</Label>
            <Switch id={`av-save-${jobId}`} checked={salvar} disabled={!canEdit} onCheckedChange={setSalvar} />
          </div>
          {salvar && (
            <div className="grid gap-2">
              <Label htmlFor={`av-name-${jobId}`}>Nome do avatar</Label>
              <Input id={`av-name-${jobId}`} value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} placeholder="Ana, apresentadora" />
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <Button
          variant="secondary"
          className="justify-self-start"
          disabled={run.isPending || (modo === "biblioteca" && !avatarId)}
          onClick={() => run.mutate()}
        >
          {run.isPending && <Loader2 className="animate-spin" />}Usar este avatar
        </Button>
      )}
    </section>
  );
}

/** Tags {{...}} citadas no roteiro/cenas (mesma regra do servidor). */
export function personaTagsIn(texts: Array<string | null | undefined>): string[] {
  const all = texts.filter(Boolean).join("\n");
  return [...new Set([...all.matchAll(/\{\{\s*([A-Za-z0-9_-]{2,24})\s*\}\}/g)].map((m) => m[1]!.toLowerCase()))];
}

/** Tags citadas que ainda não têm avatar na biblioteca do perfil. */
export function usePendingPersonaTags(profileId: string | null, texts: Array<string | null | undefined>) {
  const avatars = useProfileAvatars(profileId);
  const tags = personaTagsIn(texts);
  const known = new Set((avatars.data ?? []).map((a) => a.tag.toLowerCase()).filter(Boolean));
  return avatars.data ? tags.filter((t) => !known.has(t)) : [];
}

export function warnPendingPersonas(pending: string[]) {
  if (!pending.length) return;
  toast.warning(
    `Sem avatar para ${pending.map((t) => `{{${t}}}`).join(", ")}: ${pending.length > 1 ? "essas personas vão sair" : "essa persona vai sair"} sem referência (a IA inventa o rosto).`,
  );
}

/** Resumo "Personagens deste vídeo" com criação de avatar na hora. */
export function PersonaTagsSummary({
  profileId,
  texts,
  canEdit,
}: {
  profileId: string;
  texts: Array<string | null | undefined>;
  canEdit: boolean;
}) {
  const avatars = useProfileAvatars(profileId);
  const [open, setOpen] = useState(false);
  const [tagNova, setTagNova] = useState("");
  const tags = personaTagsIn(texts);
  const byTag = new Map((avatars.data ?? []).filter((a) => a.tag).map((a) => [a.tag.toLowerCase(), a]));
  const pendentes = tags.filter((t) => !byTag.has(t));

  const abrir = (tag: string) => { setTagNova(tag); setOpen(true); };

  return (
    <div className="grid gap-2 rounded-xl border p-3" data-testid="persona-summary">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Personagens deste vídeo</p>
        {canEdit && (
          <Button type="button" size="sm" variant="ghost" onClick={() => abrir("")}>
            <Plus />Criar avatar
          </Button>
        )}
      </div>
      {avatars.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Carregando avatares...</p>
      ) : !tags.length ? (
        <p className="text-xs text-muted-foreground">Nenhuma etiqueta {"{{...}}"} no roteiro. Use {"{{nome}}"} nas cenas para colocar uma persona.</p>
      ) : (
        <ul className="grid gap-2">
          {tags.map((tag) => {
            const av = byTag.get(tag);
            const foto = av ? (av.primary_url ?? av.reference_urls[0]) : null;
            return (
              <li key={tag} className="flex items-center gap-3">
                {foto ? (
                  <img src={foto} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <span className={`grid size-9 place-items-center rounded-lg ${av ? "bg-secondary" : "border border-dashed"} text-muted-foreground`}><UserRound className="size-4" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-bold">{`{{${tag}}}`}</code>
                  <p className="truncate text-xs text-muted-foreground">{av ? av.name : "Pendente: sem avatar, a IA vai inventar"}</p>
                </div>
                {av ? (
                  <span className="text-xs font-medium text-primary">OK</span>
                ) : canEdit ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => abrir(tag)}>Criar avatar {`{{${tag}}}`}</Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {pendentes.length > 1 && <p className="text-xs text-muted-foreground">{pendentes.length} personas pendentes.</p>}
      <AvatarFormDialog open={open} profileId={profileId} avatar={null} onOpenChange={setOpen} initialTag={tagNova || undefined} />
    </div>
  );
}
