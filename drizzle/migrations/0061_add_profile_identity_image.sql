ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_image_path text;

COMMENT ON COLUMN public.profiles.profile_image_path IS 'Private storage path for the profile/channel identity image shown only in the app interface; unrelated to video avatars and personas.';