DROP INDEX IF EXISTS public.products_profile_source_external_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_profile_source_external_id_key
  ON public.products (profile_id, source, external_id);