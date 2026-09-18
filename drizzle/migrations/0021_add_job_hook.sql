ALTER TABLE public.jobs
ADD COLUMN hook TEXT;

COMMENT ON COLUMN public.jobs.hook IS 'Gancho falado nos primeiros segundos, persistido separadamente do roteiro e do CTA final.';

UPDATE public.jobs
SET hook = NULLIF(
  btrim(
    regexp_replace(
      split_part(replace(script, E'\r', ''), E'\n\nCORPO', 1),
      '^\s*GANCHO(?:\s*\([^)]*\))?\s*(?:[:\-–]\s*)?',
      '',
      'i'
    )
  ),
  ''
)
WHERE hook IS NULL
  AND script IS NOT NULL
  AND script ~* '^\s*GANCHO';