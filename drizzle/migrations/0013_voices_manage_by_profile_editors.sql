DROP POLICY IF EXISTS voices_insert_admin ON public.voices;
DROP POLICY IF EXISTS voices_update_admin ON public.voices;
DROP POLICY IF EXISTS voices_delete_admin ON public.voices;

CREATE POLICY voices_insert_editor ON public.voices
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_app_admin(auth.uid())
    OR private.is_backoffice(auth.uid())
    OR private.has_permission_any(auth.uid(), 'perfis', 'editar')
    OR private.has_permission_any(auth.uid(), 'perfis', 'criar')
  );

CREATE POLICY voices_update_editor ON public.voices
  FOR UPDATE TO authenticated
  USING (
    private.is_app_admin(auth.uid())
    OR private.is_backoffice(auth.uid())
    OR private.has_permission_any(auth.uid(), 'perfis', 'editar')
  )
  WITH CHECK (
    private.is_app_admin(auth.uid())
    OR private.is_backoffice(auth.uid())
    OR private.has_permission_any(auth.uid(), 'perfis', 'editar')
  );

CREATE POLICY voices_delete_editor ON public.voices
  FOR DELETE TO authenticated
  USING (
    private.is_app_admin(auth.uid())
    OR private.is_backoffice(auth.uid())
    OR private.has_permission_any(auth.uid(), 'perfis', 'editar')
  );