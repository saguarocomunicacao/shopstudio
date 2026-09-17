CREATE OR REPLACE FUNCTION private.has_permission_any(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.is_app_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1
      FROM public.user_profile_roles upr
      JOIN public.role_permissions rp ON rp.role_id = upr.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE upr.user_id = _user_id
        AND p.module = _module
        AND p.action = _action
    )
  );
$$;

DROP POLICY IF EXISTS consumo_eventos_select ON public.consumo_eventos;

CREATE POLICY consumo_eventos_select ON public.consumo_eventos
FOR SELECT
USING (
  private.is_app_admin(auth.uid())
  OR (profile_id IS NOT NULL AND private.has_permission(auth.uid(), profile_id, 'custos', 'visualizar'))
  OR (profile_id IS NULL AND private.has_permission_any(auth.uid(), 'custos', 'ver_global'))
);
