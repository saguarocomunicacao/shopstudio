alter table public.video_analises add column if not exists arquivo_nome text, add column if not exists arquivo_bytes bigint;
update public.video_analises v set arquivo_nome = v.titulo where v.origem = 'arquivo' and v.arquivo_nome is null;
update public.video_analises v set arquivo_bytes = (o.metadata->>'size')::bigint
  from storage.objects o where o.bucket_id = 'video-analises' and o.name = v.storage_path and v.arquivo_bytes is null;