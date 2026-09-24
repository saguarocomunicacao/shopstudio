ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS onboarding_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_banner_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_my_onboarding(_seen boolean DEFAULT NULL, _step integer DEFAULT NULL, _banner_hidden boolean DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.app_users SET
    onboarding_seen = COALESCE(_seen, onboarding_seen),
    onboarding_step = COALESCE(LEAST(GREATEST(_step, 0), 9), onboarding_step),
    onboarding_banner_hidden = COALESCE(_banner_hidden, onboarding_banner_hidden)
  WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.set_my_onboarding(boolean, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_onboarding(boolean, integer, boolean) TO authenticated;