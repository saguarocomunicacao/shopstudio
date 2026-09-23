import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VISUAL_STYLE_OPTIONS } from "@/lib/visual-style";

const STYLE_VALUES = VISUAL_STYLE_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const setJobVisualStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      style: z.enum(STYLE_VALUES).nullable(),
      custom: z.string().trim().max(500).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error: jobError } = await context.supabase
      .from("jobs")
      .select("profile_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("Vídeo não encontrado.");

    const { data: canEdit, error: permissionError } = await context.supabase.rpc("can_edit_pipeline", {
      _profile_id: job.profile_id,
    });
    if (permissionError) throw new Error(permissionError.message);
    if (!canEdit) throw new Error("Você não tem permissão para alterar este vídeo.");

    const custom = data.style === "personalizado" ? data.custom?.trim() || null : null;
    if (data.style === "personalizado" && !custom) throw new Error("Descreva o estilo personalizado.");

    const { error } = await context.supabase
      .from("jobs")
      .update({ visual_style_override: data.style, visual_style_custom: custom })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { style: data.style, custom };
  });