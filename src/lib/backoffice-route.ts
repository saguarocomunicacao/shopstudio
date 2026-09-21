import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function requireBackofficeRoute() {
  const { data, error } = await supabase.rpc("is_backoffice");
  if (error || data !== true) {
    throw redirect({ to: "/app" });
  }
}