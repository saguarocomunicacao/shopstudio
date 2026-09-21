ALTER TABLE public.profile_video_settings
ADD COLUMN recording_aspect_ratio text NOT NULL DEFAULT '9:16';

ALTER TABLE public.profile_video_settings
ADD CONSTRAINT profile_video_settings_recording_aspect_ratio_check
CHECK (recording_aspect_ratio IN ('9:16', '1:1', '4:5', '16:9'));