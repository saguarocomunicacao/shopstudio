/**
 * Catálogo de vozes de narração (clonadas, catálogo ElevenLabs e vozes padrão
 * Azure). Só cadastro e seleção: a montagem do vídeo ainda usa a voz padrão.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VoiceFonte = "clonada" | "elevenlabs_catalogo" | "azure_padrao";
export type VoiceGenero = "masculino" | "feminino" | "neutro";

export type VoiceRow = {
  id: string;
  nome: string;
  fonte: VoiceFonte;
  voice_id: string;
  genero: VoiceGenero | null;
  profile_id: string | null;
  owner_id: string | null;
  preview_url: string | null;
  created_at: string;
};

export const FONTE_LABELS: Record<VoiceFonte, string> = {
  clonada: "Voz clonada",
  elevenlabs_catalogo: "Catálogo ElevenLabs",
  azure_padrao: "Voz padrão",
};

export const GENERO_LABELS: Record<VoiceGenero, string> = {
  masculino: "Masculina",
  feminino: "Feminina",
  neutro: "Neutra",
};

export const PREVIEW_PHRASE = "Oi, essa é a minha voz no Shop Studio.";

const SELECT = "id, nome, fonte, voice_id, genero, profile_id, owner_id, preview_url, created_at";

/** Vozes globais + as do perfil informado (quando informado). */
export function useVoices(profileId?: string | null) {
  return useQuery({
    queryKey: ["voices", profileId ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("voices").select(SELECT).order("created_at");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as VoiceRow[];
      if (!profileId) return rows;
      return rows.filter((v) => !v.profile_id || v.profile_id === profileId);
    },
  });
}

/**
 * Regra de resolução da voz (usada na Parte 2): voz clonada escolhida no
 * perfil > voz escolhida (catálogo ou padrão) > voz padrão por idioma.
 */
export function resolveVoice(voices: VoiceRow[], voiceRef: string | null): VoiceRow | null {
  if (!voiceRef) return null;
  return voices.find((v) => v.id === voiceRef) ?? null;
}
