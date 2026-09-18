ALTER TABLE public.jobs
ADD COLUMN post_cta TEXT;

COMMENT ON COLUMN public.jobs.post_cta IS 'CTA ou título editável usado somente no texto da publicação; não altera o roteiro narrado.';