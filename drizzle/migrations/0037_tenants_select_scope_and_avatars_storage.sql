DROP POLICY IF EXISTS tenants_select ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_authenticated" ON public.tenants;

CREATE POLICY tenants_select_scoped ON public.tenants
  FOR SELECT TO authenticated
  USING (private.is_super_admin(auth.uid()) OR id = private.current_tenant_id());

CREATE POLICY avatars_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);