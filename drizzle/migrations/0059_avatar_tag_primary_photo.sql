ALTER TABLE public.profile_avatars
  ADD COLUMN IF NOT EXISTS tag text,
  ADD COLUMN IF NOT EXISTS primary_url text;

CREATE UNIQUE INDEX IF NOT EXISTS profile_avatars_profile_tag_key
  ON public.profile_avatars (profile_id, lower(tag))
  WHERE tag IS NOT NULL AND tag <> '';