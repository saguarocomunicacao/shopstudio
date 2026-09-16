CREATE TABLE public.categories (
  category_id text PRIMARY KEY,
  category_name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  parent_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_write_admin" ON public.categories FOR ALL TO authenticated
  USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ADD COLUMN category_id text REFERENCES public.categories(category_id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN category_id text REFERENCES public.categories(category_id) ON DELETE SET NULL;

CREATE INDEX profiles_category_id_idx ON public.profiles (category_id);
CREATE INDEX products_category_id_idx ON public.products (category_id);