-- (c) Fotos: cada usuário lê só a própria pasta; logos de canal só quem vê o perfil.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read_scoped on storage.objects for select to authenticated
using (
  bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[2] = 'profiles'
      and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
      and public.can_view_profile(case when (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[3])::uuid end)
    )
  )
);

-- (b) Catálogo de permissões: admin do app vê tudo; demais só as que têm por algum papel.
drop policy if exists permissions_select on public.permissions;
create policy permissions_select_scoped on public.permissions for select to authenticated
using (
  public.is_super_admin()
  or private.is_app_admin(auth.uid())
  or exists (
    select 1 from public.role_permissions rp
    join public.user_profile_roles upr on upr.role_id = rp.role_id
    where rp.permission_id = permissions.id and upr.user_id = auth.uid()
  )
);

create or replace function public.minhas_permissoes()
returns table(profile_id uuid, module text, action text)
language sql stable security definer set search_path = public
as $$
  select distinct upr.profile_id, p.module, p.action
  from user_profile_roles upr
  join role_permissions rp on rp.role_id = upr.role_id and rp.tenant_id = upr.tenant_id
  join permissions p on p.id = rp.permission_id
  where upr.user_id = auth.uid()
$$;
revoke all on function public.minhas_permissoes() from public, anon;
grant execute on function public.minhas_permissoes() to authenticated;