import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MAX_PROFILE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PROFILE_IMAGE_BASE64_LENGTH = Math.ceil((MAX_PROFILE_IMAGE_BYTES * 4) / 3) + 4;

const uploadInput = z.object({
  profileId: z.string().uuid(),
  base64: z.string().min(16).max(MAX_PROFILE_IMAGE_BASE64_LENGTH, "A imagem deve ter no máximo 15 MB."),
  mimeType: z.literal("image/png"),
});

export const saveProfileImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: canEdit, error: permissionError } = await context.supabase.rpc("can_edit_profile", { _profile_id: data.profileId });
    if (permissionError || !canEdit) throw new Error("Você não tem permissão para alterar este perfil.");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("tenant_id, profile_image_path")
      .eq("id", data.profileId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("Perfil não encontrado.");

    const bytes = Uint8Array.from(atob(data.base64), (character) => character.charCodeAt(0));
    if (bytes.byteLength > MAX_PROFILE_IMAGE_BYTES) throw new Error("A imagem deve ter no máximo 15 MB.");

    const path = `${profile.tenant_id}/profiles/${data.profileId}/identity-${Date.now()}.png`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (uploadError) {
      console.error("[profile-image] upload", uploadError);
      throw new Error("Não foi possível guardar a foto do perfil. Tente novamente.");
    }

    const { data: updated, error: updateError } = await context.supabase
      .from("profiles")
      .update({ profile_image_path: path })
      .eq("id", data.profileId)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      await supabaseAdmin.storage.from("avatars").remove([path]);
      throw new Error("Não foi possível salvar a foto do perfil. Tente novamente.");
    }

    if (profile.profile_image_path && profile.profile_image_path !== path) {
      const { error: removeError } = await supabaseAdmin.storage.from("avatars").remove([profile.profile_image_path]);
      if (removeError) console.error("[profile-image] remove previous", removeError);
    }
    return { path };
  });

export const getProfileImageUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().uuid(), path: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("profile_image_path")
      .eq("id", data.profileId)
      .maybeSingle();
    if (error || !profile || profile.profile_image_path !== data.path) return { url: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage.from("avatars").createSignedUrl(data.path, 15 * 60);
    if (signError) {
      console.error("[profile-image] sign", signError);
      return { url: null };
    }
    return { url: signed.signedUrl };
  });