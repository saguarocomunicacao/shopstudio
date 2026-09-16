ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seller_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sales_volume integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS growth_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS products_source_external_id_key
  ON public.products (source, external_id)
  WHERE external_id IS NOT NULL;