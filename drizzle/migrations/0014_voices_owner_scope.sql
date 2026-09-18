ALTER TABLE public.voices ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Vozes de sistema (padrão) ficam sem dono; as demais passam a pertencer
-- ao super admin, que foi quem as cadastrou até aqui.
UPDATE public.voices
   SET owner_id = COALESCE(created_by, (SELECT id FROM public.app_users WHERE lower(email) = private.super_admin_email() LIMIT 1))
 WHERE owner_id IS NULL
   AND fonte <> 'azure_padrao';

DROP POLICY IF EXISTS voices_select ON public.voices;
DROP POLICY IF EXISTS voices_insert_editor ON public.voices;
DROP POLICY IF EXISTS voices_update_editor ON public.voices;
DROP POLICY IF EXISTS voices_delete_editor ON public.voices;

-- Leitura: vozes de sistema (sem dono) para todos; vozes com dono só para o dono.
CREATE POLICY voices_select_owner ON public.voices
  FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid() OR private.is_backoffice(auth.uid()));

-- Escrita: o usuário cria vozes para si mesmo; backoffice mantém as de sistema.
CREATE POLICY voices_insert_owner ON public.voices
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR private.is_backoffice(auth.uid()));

CREATE POLICY voices_update_owner ON public.voices
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR private.is_backoffice(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR private.is_backoffice(auth.uid()));

CREATE POLICY voices_delete_owner ON public.voices
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR private.is_backoffice(auth.uid()));