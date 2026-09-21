CREATE TABLE public.tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.default_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gemini','json2video','elevenlabs','kalodata')),
  encrypted_key text NOT NULL,
  status text NOT NULL DEFAULT 'configurada',
  last_tested_at timestamptz,
  last_test_ok boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX idx_tenant_api_keys_tenant ON public.tenant_api_keys(tenant_id);

-- Leitura do front: somente metadados. A coluna encrypted_key nunca recebe grant.
GRANT SELECT (id, tenant_id, provider, status, last_tested_at, last_test_ok, created_at, updated_at)
  ON public.tenant_api_keys TO authenticated;
GRANT ALL ON public.tenant_api_keys TO service_role;

ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_api_keys_select ON public.tenant_api_keys
  FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id));

CREATE TRIGGER tenant_api_keys_set_updated_at
  BEFORE UPDATE ON public.tenant_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();