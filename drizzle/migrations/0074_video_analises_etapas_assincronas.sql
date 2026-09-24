alter table public.video_analises
  add column if not exists gemini_file_name text,
  add column if not exists gemini_file_uri text,
  add column if not exists etapa text,
  add column if not exists etapa_em timestamptz,
  add column if not exists analise_iniciada_em timestamptz,
  add column if not exists tentativas integer not null default 0,
  add column if not exists etapa_log jsonb not null default '[]'::jsonb,
  add column if not exists passo_lock timestamptz;
create index if not exists video_analises_analisando_idx on public.video_analises (status) where status = 'analisando';