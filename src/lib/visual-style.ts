export const VISUAL_STYLE_OPTIONS = [
  { value: "realista", label: "Realista" },
  { value: "cartoon", label: "Cartoon / Quadrinho" },
  { value: "3d", label: "3D / Pixar" },
  { value: "aquarela", label: "Aquarela" },
  { value: "anime", label: "Anime" },
  { value: "personalizado", label: "Personalizado" },
] as const;

export type VisualStyle = (typeof VISUAL_STYLE_OPTIONS)[number]["value"];

export const DEFAULT_VISUAL_STYLE: VisualStyle = "realista";

export function isVisualStyle(value: unknown): value is VisualStyle {
  return VISUAL_STYLE_OPTIONS.some((option) => option.value === value);
}

export function visualStyleLabel(value: VisualStyle): string {
  return VISUAL_STYLE_OPTIONS.find((option) => option.value === value)?.label ?? "Realista";
}

export function visualStyleDescription(style: VisualStyle, custom?: string | null): string {
  if (style === "personalizado") return custom?.trim() || "realistic visual style";
  const descriptions: Record<Exclude<VisualStyle, "personalizado">, string> = {
    realista: "photorealistic, natural light, lifelike materials, realistic skin and proportions",
    cartoon: "polished editorial cartoon and comic-book illustration, expressive clean linework and coherent cel shading",
    "3d": "polished cinematic 3D animated-feature look, expressive forms, dimensional lighting and detailed materials",
    aquarela: "refined watercolor illustration, visible paper texture, translucent pigment layers and soft organic edges",
    anime: "high-quality contemporary anime illustration, precise linework, expressive features and cinematic cel shading",
  };
  return descriptions[style];
}

export function visualStylePrompt(style: VisualStyle, custom?: string | null): string {
  const description = visualStyleDescription(style, custom);
  return `VISUAL STYLE — CONSISTENCY IS MANDATORY: Render this scene as ${description}. Apply this exact visual treatment to every scene in this video and keep it consistent with the profile's series. The reference photos define each person's identity only; preserve their recognizable facial features while translating the scene into this visual style. Do not change, stylize, merge or reinterpret the reference images themselves.`;
}