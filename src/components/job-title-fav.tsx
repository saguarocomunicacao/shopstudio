import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { DbJob } from "@/lib/content";
import { cn } from "@/lib/utils";

const JOB_COLS =
  "id, product_id, profile_id, status, title, created_at, script, hook, post_cta, caption, hashtags, video_url, video_thumbnail_url, render_id, render_error, render_started_at, render_stage, scenes, gemini_images_count, veo_takes_count, voice_ref, video_path, video_original_path, video_edited_path, video_choice, video_edits, ai_status, ai_render_stage, ai_render_error, ai_video_url, ai_video_path, ai_video_thumbnail_url, published_url, approved_at, published_at, rejection_reason, script_refs, formato, roteiro_blocos, texto_tela, recorded_at, deleted_at, deleted_from_status, visual_style_override, visual_style_custom, favorito";

/** Favoritos do perfil, de qualquer etapa (inclusive lixeira). */
export function useFavoriteJobs(profileId: string | null) {
  return useQuery({
    queryKey: ["jobs-favs", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(JOB_COLS)
        .eq("profile_id", profileId!)
        .eq("favorito", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error("Não foi possível carregar os favoritos.");
      return (data ?? []) as unknown as DbJob[];
    },
  });
}

/** Atualiza listas quando qualquer vídeo do perfil muda (favoritos, título, etapa). */
export function useJobsRealtime(profileId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!profileId) return;
    const ch = supabase
      .channel(`jobs-${profileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `profile_id=eq.${profileId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["jobs"] });
        void qc.invalidateQueries({ queryKey: ["jobs-trash"] });
        void qc.invalidateQueries({ queryKey: ["jobs-favs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profileId, qc]);
}

function invalidateJobs(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["jobs", "jobs-trash", "jobs-favs", "draft-kit"]) void qc.invalidateQueries({ queryKey: [k] });
}

export function FavoriteStar({ job, className, disabled }: { job: Pick<DbJob, "id"> & { favorito?: boolean | null }; className?: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const [fav, setFav] = useState(!!job.favorito);
  const [justFavorited, setJustFavorited] = useState(false);
  useEffect(() => setFav(!!job.favorito), [job.favorito]);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !fav;
    setFav(next);
    if (next) {
      setJustFavorited(true);
      window.setTimeout(() => setJustFavorited(false), 200);
    }
    // Retira/insere na hora na aba Favoritos.
    qc.setQueriesData<DbJob[]>({ queryKey: ["jobs-favs"] }, (old) =>
      old ? (next ? old : old.filter((j) => j.id !== job.id)) : old,
    );
    const { error } = await supabase.from("jobs").update({ favorito: next }).eq("id", job.id);
    if (error) {
      setFav(!next);
      toast.error("Não foi possível atualizar o favorito.");
    }
    invalidateJobs(qc);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={fav ? "Remover dos favoritos" : "Favoritar"}
      className={cn(
        "grid size-11 place-items-center rounded-full bg-overlay/70 transition-colors hover:bg-overlay disabled:opacity-50",
        className,
      )}
    >
      <Heart
        strokeWidth={2}
        className={cn(
          "size-[22px] text-primary",
          fav && "fill-primary",
          justFavorited && "animate-favorite-pop",
        )}
      />
    </button>
  );
}

export function InlineTitle({
  jobId,
  title,
  canEdit,
  className,
  fallback = "Sem título",
}: {
  jobId: string;
  title: string | null | undefined;
  canEdit: boolean;
  className?: string;
  fallback?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");
  const [shown, setShown] = useState(title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => setShown(title ?? ""), [title]);

  const start = () => {
    if (!canEdit) return;
    done.current = false;
    setValue(shown);
    setEditing(true);
    window.setTimeout(() => inputRef.current?.select(), 0);
  };
  const save = async () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const next = value.trim().slice(0, 120);
    if (!next || next === shown) return;
    const prev = shown;
    setShown(next);
    const { error } = await supabase.from("jobs").update({ title: next }).eq("id", jobId);
    if (error) {
      setShown(prev);
      toast.error("Não foi possível atualizar o título.");
      return;
    }
    toast.success("Título atualizado");
    invalidateJobs(qc);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            setEditing(false);
          }
        }}
        aria-label="Editar título"
        className={cn("animate-title-edit-border w-full rounded-lg border border-dashed border-primary bg-card px-2 py-1 outline-none", className)}
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", className)} onDoubleClick={start}>
        {shown || fallback}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            start();
          }}
          aria-label="Editar título"
          title="Editar título"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
      )}
    </div>
  );
}
