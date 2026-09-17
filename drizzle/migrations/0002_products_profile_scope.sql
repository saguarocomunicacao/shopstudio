ALTER TABLE public.products ADD COLUMN profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.products
SET profile_id = (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1)
WHERE profile_id IS NULL;

CREATE INDEX products_profile_id_idx ON public.products (profile_id);

DROP INDEX IF EXISTS public.products_source_external_id_key;

CREATE UNIQUE INDEX products_profile_source_external_id_key
  ON public.products (profile_id, source, external_id)
  WHERE external_id IS NOT NULL;