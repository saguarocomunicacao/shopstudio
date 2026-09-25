import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/page-loader";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteTenantApiKey, saveTenantApiKey, testTenantApiKey } from "@/lib/tenant-keys.functions";
import { actionError, useTenantKeys } from "@/lib/api-keys";
import { useStudio } from "./studio-context";

type Provider = "gemini" | "json2video" | "elevenlabs" | "kalodata" | "apify";

const PROVIDERS: { id: Provider; nome: string; descricao: string; ondeAchar: string }[] = [
  { id: "gemini", nome: "Gemini (imagens e vídeo Veo)", descricao: "Uma única chave do Google cobre a geração de imagens e a animação em vídeo.", ondeAchar: "Google AI Studio" },
  { id: "json2video", nome: "JSON2Video", descricao: "Montagem final do vídeo com legendas e trilha.", ondeAchar: "Painel do JSON2Video" },
  { id: "elevenlabs", nome: "ElevenLabs", descricao: "Narração em voz.", ondeAchar: "Painel da ElevenLabs" },
  { id: "kalodata", nome: "Kalodata", descricao: "Busca de produtos e vídeos campeões.", ondeAchar: "Painel do Kalodata" },
  { id: "apify", nome: "Apify", descricao: "Baixa vídeos de links do TikTok, YouTube e Instagram para análise.", ondeAchar: "Apify Console > Settings > API & Integrations" },
];

type KeyRow = { provider: Provider; status: string; last_tested_at: string | null; last_test_ok: boolean | null };

function useKeys() {
  return useQuery({
    queryKey: ["tenant-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_api_keys")
        .select("provider, status, last_tested_at, last_test_ok");
      if (error) throw new Error(error.message);
      return (data ?? []) as KeyRow[];
    },
  });
}

function ProviderCard({ meta, row, byok }: { meta: (typeof PROVIDERS)[number]; row: KeyRow | undefined; byok: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const save = useServerFn(saveTenantApiKey);
  const remove = useServerFn(deleteTenantApiKey);
  const test = useServerFn(testTenantApiKey);
  const refresh = () => qc.invalidateQueries({ queryKey: ["tenant-api-keys"] });
  const fail = (e: unknown) => {
    console.error(`[api-key] ${meta.id}`, e);
    toast.error(actionError(e, "Não foi possível concluir. Verifique a chave e tente novamente."));
  };

  const saving = useMutation({
    mutationFn: () => save({ data: { provider: meta.id, apiKey: value.trim() } }),
    onSuccess: () => { setValue(""); toast.success("Chave guardada com segurança."); refresh(); },
    onError: fail,
  });
  const testing = useMutation({
    mutationFn: () => test({ data: { provider: meta.id } }),
    onSuccess: (r) => { r.ok ? toast.success(r.detalhe) : toast.error(r.detalhe); refresh(); },
    onError: fail,
  });
  const removing = useMutation({
    mutationFn: () => remove({ data: { provider: meta.id } }),
    onSuccess: () => { toast.success("Chave removida."); refresh(); },
    onError: fail,
  });

  const configurada = !!row;
  const testadoEm = row?.last_tested_at ? new Date(row.last_tested_at).toLocaleString("pt-BR") : null;

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{meta.nome}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{meta.descricao}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${configurada ? "bg-primary/15 text-primary" : byok ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"}`}>
          {configurada ? "••••• configurada" : byok ? "Pendente · obrigatória no seu plano" : "não configurada"}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          placeholder={configurada ? "Colar nova chave para substituir" : `Colar a chave (${meta.ondeAchar})`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button disabled={saving.isPending || value.trim().length < 8} onClick={() => saving.mutate()}>
          {saving.isPending && <Loader2 className="size-4 animate-spin" />}Salvar
        </Button>
      </div>

      {configurada && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={testing.isPending} onClick={() => testing.mutate()}>
            {testing.isPending && <Loader2 className="size-4 animate-spin" />}Testar
          </Button>
          <Button variant="ghost" disabled={removing.isPending} onClick={() => removing.mutate()}>
            <Trash2 className="size-4" />Remover
          </Button>
          {row?.last_test_ok != null && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {row.last_test_ok ? <CheckCircle2 className="size-4 text-primary" /> : <XCircle className="size-4 text-destructive" />}
              {row.last_test_ok ? "Último teste: funcionou" : "Último teste: falhou"}
              {testadoEm ? ` · ${testadoEm}` : ""}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function ApiKeysPage() {
  const { isAdmin, isSuperAdmin } = useStudio();
  const { data, isLoading } = useKeys();
  const { data: tenantKeys } = useTenantKeys();
  const byok = !!tenantKeys?.byok;

  if (!isAdmin && !isSuperAdmin) {
    return <div className="panel"><h1 className="font-bold">Acesso restrito</h1><p className="mt-1 text-sm text-muted-foreground">Apenas o administrador da conta pode ver as chaves de API.</p></div>;
  }

  const byProvider = new Map((data ?? []).map((r) => [r.provider, r]));

  return (
    <>
      <div className="mb-6">
        <h1 className="page-title">Minhas APIs</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          No plano em que você usa suas próprias contas, estas chaves passam a gerar o conteúdo no lugar das chaves do Shop Studio.
          A inteligência que escreve roteiros e descrições roda sempre na plataforma. As chaves ficam guardadas de forma cifrada e nunca são
          mostradas de volta. O teste faz a chamada mais leve possível a cada serviço e, em alguns deles, pode consumir um crédito mínimo.
        </p>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PROVIDERS.map((meta) => <ProviderCard key={meta.id} meta={meta} row={byProvider.get(meta.id)} byok={byok} />)}
        </div>
      )}
    </>
  );
}
