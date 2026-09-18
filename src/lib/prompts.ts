import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PromptTemplate = {
  key: string;
  title: string;
  description: string;
  body: string;
  placeholders: string[];
  sort_order: number;
  updated_at: string;
};

export type PromptOverride = {
  profile_id: string;
  key: string;
  body: string;
  /** "copiado_do_padrao" = ainda igual ao padrão do sistema; "personalizado" = editado pelo cliente. */
  origem: string;
  /** Data do padrão que originou a cópia, para avisar quando houver versão mais nova. */
  origem_versao: string | null;
};

/** Prompts padrão globais (backoffice). */
export function usePromptTemplates() {
  return useQuery({
    queryKey: ["prompt-templates"],
    queryFn: async (): Promise<PromptTemplate[]> => {
      const { data, error } = await supabase
        // View: o texto padrão só vem preenchido para o backoffice; os demais recebem body vazio.
        .from("prompt_templates_visible")
        .select("key, title, description, body, placeholders, sort_order, updated_at")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as PromptTemplate[];
    },
  });
}

/** Overrides de um perfil (só os prompts que ele sobrescreveu). */
export function usePromptOverrides(profileId: string | null) {
  return useQuery({
    queryKey: ["prompt-overrides", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<PromptOverride[]> => {
      const { data, error } = await supabase
        .from("profile_prompt_overrides")
        .select("profile_id, key, body, origem, origem_versao")
        .eq("profile_id", profileId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as PromptOverride[];
    },
  });
}
