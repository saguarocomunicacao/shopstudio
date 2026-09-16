CREATE OR REPLACE FUNCTION public.can_edit_pipeline(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_permission(auth.uid(), _profile_id, 'pipeline', 'editar')
      OR private.has_permission(auth.uid(), _profile_id, 'pipeline', 'criar');
$$;

REVOKE ALL ON FUNCTION public.can_edit_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_pipeline(uuid) TO authenticated, service_role;