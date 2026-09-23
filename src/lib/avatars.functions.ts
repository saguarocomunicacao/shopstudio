import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Biblioteca de avatares por perfil e override de avatar por vídeo.
 * O avatar escolhido na geração vale só para aquele vídeo: o avatar principal
 * do perfil nunca é alterado aqui.
 */

export const MAX_AVATAR_IMAGES = 5;

const imageSchema = z.union([
  z.object({
    base64: z.string().min(16).max(9_000_000),
    mimeType: z.enum(["image/jpeg", "image/png", "image/jpg", "image/webp"]),
  }),
  z.object({ url: z.string().url() }),
]);

type ImageInput = z.infer<typeof imageSchema>;

/** Guarda as fotos novas no bucket privado e devolve a lista final de URLs. */
async function storeImages(prefix: string, images: ImageInput[]) {
  const pipeline = await import("./video-pipeline.server");
  const urls: string[] = [];
  for (const [i, image] of images.entries()) {
    if ("url" in image) {
      urls.push(image.url);
      continue;
    }
    const ext = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
    const stored = await pipeline.storeMedia(
      `${prefix}/${Date.now()}-${i + 1}.${ext}`,
      Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0)),
      image.mimeType,
    );
    urls.push(stored.url);
  }
  return urls;
}

/** Normaliza a tag da persona: minúscula, sem acento e sem espaço. */
export function slugifyTag(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

export const TAG_REGEX = /^[a-z0-9_]{2,24}$/;

const avatarInput = z.object({
  profileId: z.string().uuid(),
  avatarId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Dê um nome para o avatar.").max(80),
  tag: z.string().trim().max(24).default(""),
  description: z.string().trim().max(600).default(""),
  images: z.array(imageSchema).max(MAX_AVATAR_IMAGES).default([]),
  primaryIndex: z.number().int().min(0).max(MAX_AVATAR_IMAGES - 1).default(0),
});

/** Cria ou atualiza um avatar da biblioteca do perfil. */
export const saveProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    avatarInput
      .superRefine((v, ctx) => {
        if (!v.images.length && !v.description.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Envie ao menos uma foto ou escreva a descrição do avatar.",
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const tag = slugifyTag(data.tag || data.name);
    if (tag && !TAG_REGEX.test(tag)) {
      throw new Error("A etiqueta deve ter de 2 a 24 letras, números ou _ (sem espaço nem acento).");
    }
    const urls = await storeImages(`avatars/${data.profileId}/biblioteca`, data.images);
    const payload = {
      profile_id: data.profileId,
      name: data.name,
      tag: tag || null,
      description: data.description,
      reference_urls: urls,
      primary_url: urls[data.primaryIndex] ?? urls[0] ?? null,
    };

    const duplicada = (message: string) =>
      /profile_avatars_profile_tag_key|duplicate key/i.test(message)
        ? new Error(`A etiqueta "${tag}" já é usada por outro avatar deste perfil.`)
        : new Error(message);

    if (data.avatarId) {
      const { data: row, error } = await supabase
        .from("profile_avatars")
        .update(payload)
        .eq("id", data.avatarId)
        .select("id")
        .maybeSingle();
      if (error) throw duplicada(error.message);
      if (!row) throw new Error("Você não tem permissão para editar este avatar.");
      return { avatarId: row.id as string, urls, tag };
    }

    const { data: row, error } = await supabase
      .from("profile_avatars")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .maybeSingle();
    if (error) throw duplicada(error.message);
    if (!row) throw new Error("Você não tem permissão para criar avatares neste perfil.");
    return { avatarId: row.id as string, urls, tag };
  });

/** Remove um avatar da biblioteca. Vídeos já gerados não são afetados. */
export const deleteProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ avatarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profile_avatars").delete().eq("id", data.avatarId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Define o avatar usado na geração DESTE vídeo.
 * - "perfil": limpa o override e volta ao avatar principal do perfil.
 * - "biblioteca": copia as referências do avatar salvo.
 * - "novo": fotos e/ou descrição enviadas agora, com opção de salvar na biblioteca.
 */
export const setJobAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        modo: z.enum(["perfil", "biblioteca", "novo"]),
        avatarId: z.string().uuid().optional(),
        name: z.string().trim().max(80).default(""),
        description: z.string().trim().max(600).default(""),
        images: z.array(imageSchema).max(MAX_AVATAR_IMAGES).default([]),
        salvarNaBiblioteca: z.boolean().default(false),
      })
      .superRefine((v, ctx) => {
        if (v.modo === "biblioteca" && !v.avatarId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escolha um avatar da biblioteca." });
        }
        if (v.modo === "novo" && !v.images.length && !v.description.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Envie ao menos uma foto ou escreva a descrição do avatar.",
          });
        }
        if (v.modo === "novo" && v.salvarNaBiblioteca && v.name.trim().length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Dê um nome ao avatar para salvá-lo na biblioteca." });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, profile_id, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Vídeo não encontrado ou sem permissão de acesso.");

    const { data: canEdit, error: permError } = await supabase.rpc("can_edit_pipeline", { _profile_id: job.profile_id });
    if (permError) throw new Error(permError.message);
    if (!canEdit) throw new Error("Você não tem permissão para alterar este vídeo.");

    let urls: string[] = [];
    let description = "";
    let avatarId: string | null = null;

    if (data.modo === "biblioteca") {
      const { data: avatar, error } = await supabase
        .from("profile_avatars")
        .select("id, reference_urls, description")
        .eq("id", data.avatarId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!avatar) throw new Error("Avatar não encontrado nesta biblioteca.");
      urls = Array.isArray(avatar.reference_urls)
        ? (avatar.reference_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
        : [];
      description = avatar.description ?? "";
      avatarId = avatar.id as string;
    } else if (data.modo === "novo") {
      urls = await storeImages(`avatars/${job.profile_id}/video-${job.id}`, data.images);
      description = data.description;
      if (data.salvarNaBiblioteca) {
        const { data: row, error } = await supabase
          .from("profile_avatars")
          .insert({
            profile_id: job.profile_id,
            name: data.name.trim(),
            description,
            reference_urls: urls,
            created_by: context.userId,
          })
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        avatarId = (row?.id as string) ?? null;
      }
    }

    const { error } = await supabase
      .from("jobs")
      .update({
        avatar_id: avatarId,
        avatar_reference_urls: urls,
        avatar_description: description || null,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    return { urls, description, avatarId };
  });
