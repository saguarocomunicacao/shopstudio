ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS extra_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;