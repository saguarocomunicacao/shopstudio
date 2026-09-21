/**
 * Tela "Investimento": quanto já foi colocado em cada fornecedor (aportes e
 * assinatura) contra o consumo real gravado, mostrando o que ainda resta sem
 * precisar abrir as plataformas externas.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, PiggyBank, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/custo";
import {
  ALERTA_PADRAO,
  CONFIG_INVESTIMENTO,
  useInvestimento,
  useRemoverAporte,
  useSalvarAporte,
  useSalvarPlano,
  type CarteiraFornecedor,
  type FornecedorKey,
} from "@/lib/investimento";
import { useAppConfig } from "@/lib/orcamento";
import { useMeuTenantId, useTenants } from "@/lib/tenants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudio } from "./studio-context";

const hoje = () => new Date().toISOString().slice(0, 10);
const dataCurta = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR");
const numero = (v: number) => Number(v.toFixed(2)).toLocaleString("pt-BR");
const parseNum = (v: string) => {
  const n = Number(v.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Máscara de moeda BRL: aceita só dígitos e formata com separador de milhar e 2 casas. */
const mascaraBrl = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
/** Máscara de número decimal: só dígitos e uma vírgula decimal (ex: 1234,5). */
const mascaraNumero = (raw: string) => {
  let s = raw.replace(/[^\d,]/g, "");
  const i = s.indexOf(",");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "");
  return s;
};

function Resumo({ label, value, hint, destaque }: { label: string; value: string; hint?: string; destaque?: boolean }) {
  return (
    <div className="panel">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-black ${destaque ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AporteDialog({
  fornecedor,
  unidade,
  tenantId,
  onSaved,
}: { fornecedor: FornecedorKey; unidade: string | null; tenantId: string | null; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState("");
  const [unidades, setUnidades] = useState("");
  const [obs, setObs] = useState("");
  const salvar = useSalvarAporte(tenantId);

  const submit = () => {
    const v = parseNum(valor);
    if (v === null || v < 0) {
      toast.error("Informe o valor pago em reais.");
      return;
    }
    const u = unidade ? parseNum(unidades) : null;
    if (unidade && (u === null || u < 0)) {
      toast.error(`Informe quantos ${unidade} entraram.`);
      return;
    }
    salvar.mutate(
      { fornecedor, data, valor_brl: v, unidades: u, observacao: obs.trim() || null },
      {
        onSuccess: () => {
          toast.success("Aporte registrado.");
          setOpen(false);
          setValor("");
          setUnidades("");
          setObs("");
          onSaved?.();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Registrar aporte
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Registrar aporte</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Data</label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Valor pago (R$)</label>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={valor}
              onChange={(e) => setValor(mascaraBrl(e.target.value))}
            />
          </div>
          {unidade && (
            <div className="grid gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Quantidade que entrou ({unidade})</label>
              <Input
                inputMode="decimal"
                placeholder="100"
                value={unidades}
                onChange={(e) => setUnidades(mascaraNumero(e.target.value))}
              />
            </div>
          )}
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-muted-foreground">Observação (opcional)</label>
            <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="recarga, mensalidade, nota fiscal..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanoForm({ carteira, tenantId }: { carteira: CarteiraFornecedor; tenantId: string | null }) {
  const plano = carteira.plano;
  const [creditos, setCreditos] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("");
  const salvar = useSalvarPlano(tenantId);

  useEffect(() => {
    setCreditos(plano ? String(plano.creditos_mes) : "");
    setValor(plano ? mascaraBrl(String(Math.round(plano.valor_mensal * 100))) : "");
    setDia(plano ? String(plano.dia_renovacao) : "1");
  }, [plano?.creditos_mes, plano?.valor_mensal, plano?.dia_renovacao]);

  const submit = () => {
    const c = parseNum(creditos) ?? 0;
    const v = parseNum(valor) ?? 0;
    const d = Math.min(Math.max(Math.round(parseNum(dia) ?? 1), 1), 28);
    salvar.mutate(
      { fornecedor: carteira.def.key, creditos_mes: c, valor_mensal: v, dia_renovacao: d, ativo: true },
      {
        onSuccess: () => toast.success("Plano salvo."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
      },
    );
  };

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano da assinatura</p>
      <div className="flex flex-wrap gap-3">
        <div className="grid min-w-32 flex-1 gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Créditos por mês</label>
          <Input inputMode="decimal" value={creditos} onChange={(e) => setCreditos(e.target.value)} />
        </div>
        <div className="grid min-w-32 flex-1 gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Valor mensal (R$)</label>
          <Input
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={valor}
            onChange={(e) => setValor(mascaraBrl(e.target.value))}
          />
        </div>
        <div className="grid min-w-28 flex-1 gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Dia de renovação</label>
          <Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} />
        </div>
      </div>
      <div>
        <Button size="sm" onClick={submit} disabled={salvar.isPending}>Salvar plano</Button>
      </div>
    </div>
  );
}

function CarteiraCard({
  carteira,
  podeEditar,
  tenantId,
}: { carteira: CarteiraFornecedor; podeEditar: boolean; tenantId: string | null }) {
  const { def } = carteira;
  const remover = useRemoverAporte();
  const assinatura = def.tipo === "assinatura";
  const pct = carteira.restante === null ? null : Math.round(Math.min(1, Math.max(0, carteira.restante)) * 100);

  return (
    <section className="panel grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black">{def.nome}</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {assinatura ? "Assinatura mensal" : "Carteira pré-paga"}
            </span>
            {carteira.baixo && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <AlertTriangle className="h-3 w-3" />
                Saldo baixo
              </span>
            )}
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{def.descricao}</p>
        </div>
        {podeEditar && <AporteDialog fornecedor={def.key} unidade={def.unidade} tenantId={tenantId} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-secondary px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">{assinatura ? "Resta no ciclo" : "Saldo restante"}</p>
          <p className="mt-1 text-xl font-black text-primary">
            {assinatura
              ? carteira.ciclo && carteira.ciclo.cota > 0
                ? def.unidadeLabel(Math.max(0, carteira.ciclo.cota - carteira.ciclo.usados))
                : "sem plano"
              : brl(carteira.saldoBrl ?? 0)}
          </p>
          {!assinatura && carteira.saldoUnidades !== null && (
            <p className="text-xs text-muted-foreground">{def.unidadeLabel(carteira.saldoUnidades)}</p>
          )}
          {assinatura && carteira.ciclo && carteira.ciclo.cota > 0 && (
            <p className="text-xs text-muted-foreground">
              renova em {carteira.ciclo.fim.toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-secondary px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">Consumo do mês</p>
          <p className="mt-1 text-xl font-black">{brl(carteira.consumoMesBrl)}</p>
          <p className="text-xs text-muted-foreground">acumulado: {brl(carteira.consumoBrl)}</p>
        </div>
        <div className="rounded-xl bg-secondary px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">{assinatura ? "Mensalidade" : "Total aportado"}</p>
          <p className="mt-1 text-xl font-black">
            {assinatura ? brl(carteira.plano?.valor_mensal ?? 0) : brl(carteira.aportadoBrl)}
          </p>
          {def.unidade && !assinatura && carteira.aportadoUnidades > 0 && (
            <p className="text-xs text-muted-foreground">{def.unidadeLabel(carteira.aportadoUnidades)} comprados</p>
          )}
          {assinatura && carteira.ciclo && (
            <p className="text-xs text-muted-foreground">
              {def.unidadeLabel(carteira.ciclo.usados)} usados de {def.unidadeLabel(carteira.ciclo.cota)}
            </p>
          )}
        </div>
      </div>

      {pct !== null && (
        <div className="grid gap-1">
          <Progress value={100 - pct} />
          <p className="text-xs text-muted-foreground">{pct}% ainda disponível</p>
        </div>
      )}

      {assinatura ? (
        podeEditar && <PlanoForm carteira={carteira} tenantId={tenantId} />
      ) : (
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de aportes</p>
          {carteira.aportes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aporte registrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  {def.unidade && <TableHead>{def.unidade}</TableHead>}
                  <TableHead>Observação</TableHead>
                  {podeEditar && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {carteira.aportes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{dataCurta(a.data)}</TableCell>
                    <TableCell className="font-semibold">{brl(a.valor_brl)}</TableCell>
                    {def.unidade && <TableCell>{a.unidades === null ? "—" : numero(a.unidades)}</TableCell>}
                    <TableCell className="text-muted-foreground">{a.observacao ?? "—"}</TableCell>
                    {podeEditar && (
                      <TableCell>
                        <button
                          aria-label="Remover aporte"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => {
                            if (!window.confirm("Remover este aporte?")) return;
                            remover.mutate(a.id, {
                              onSuccess: () => toast.success("Aporte removido."),
                              onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </section>
  );
}

function AlertaConfig({ alertaPercent, bloqueio }: { alertaPercent: number; bloqueio: boolean }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState(String(alertaPercent));
  useEffect(() => setTexto(String(alertaPercent)), [alertaPercent]);

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: number }) => {
      const { error } = await supabase.from("app_config").upsert({ key, value_num: value }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["app-config-all"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <section className="panel grid gap-4">
      <div>
        <h2 className="text-base font-black">Alerta de saldo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando um fornecedor fica abaixo do limite, aparece um aviso no Pipeline. O bloqueio é opcional e vale para a
          etapa cara (animação do vídeo).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid w-40 gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Avisar abaixo de (%)</label>
          <Input
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              const n = parseNum(texto);
              if (n === null || n <= 0 || n > 100) {
                toast.error("Informe um percentual entre 1 e 100.");
                return;
              }
              if (n !== alertaPercent) save.mutate({ key: CONFIG_INVESTIMENTO.alertaPercent, value: n });
            }}
          />
        </div>
        <div className="flex flex-1 items-center justify-between gap-4 rounded-xl bg-secondary px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Bloquear geração de vídeo com saldo baixo</p>
            <p className="text-xs text-muted-foreground">
              Ligado, a animação não é disparada enquanto o saldo do Google estiver abaixo do limite.
            </p>
          </div>
          <Switch
            checked={bloqueio}
            onCheckedChange={(v) => save.mutate({ key: CONFIG_INVESTIMENTO.bloqueio, value: v ? 1 : 0 })}
          />
        </div>
      </div>
    </section>
  );
}

export function InvestmentPage() {
  const { isBackoffice, can, userId } = useStudio();
  // Cada empresa vê e lança os próprios aportes; o backoffice escolhe a empresa.
  const podeVer = isBackoffice || can("investimento", "visualizar");
  const podeEditar = podeVer;
  const { data: tenants } = useTenants();
  const { data: meuTenantId } = useMeuTenantId(userId);
  const [tenantSel, setTenantSel] = useState<string | null>(null);
  const tenantId = isBackoffice ? tenantSel ?? meuTenantId ?? null : meuTenantId ?? null;
  const { data, isLoading } = useInvestimento(tenantId, isBackoffice ? "api" : "consolidado");
  useAppConfig();

  const saldoGeral = useMemo(() => {
    if (!data) return 0;
    return data.carteiras
      .filter((c) => c.def.tipo === "prepaga")
      .reduce((s, c) => s + (c.saldoBrl ?? 0), 0);
  }, [data]);

  if (!podeVer) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="panel max-w-md text-center">
          <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-black">Sem acesso ao investimento</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça a um administrador a permissão de Investimento para ver os saldos dos fornecedores.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando investimento...</p>;

  const baixos = data.carteiras.filter((c) => c.baixo);

  return (
    <div className="grid gap-6">
      {baixos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-semibold text-primary">
            <AlertTriangle className="h-4 w-4" />
            Saldo baixo
          </span>
          <span className="text-muted-foreground">
            {baixos.map((c) => c.def.nome).join(", ")} abaixo de {data.alertaPercent}% do que foi contratado.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo label="Total investido" value={brl(data.totalInvestidoBrl)} hint="aportes e mensalidades lançados" />
        <Resumo label="Total consumido" value={brl(data.totalConsumidoBrl)} hint="calculado dos eventos gravados" />
        <Resumo label="Saldo pré-pago" value={brl(saldoGeral)} destaque hint="Google + Kalodata" />
        <Resumo
          label="Consumo do mês"
          value={brl(data.carteiras.reduce((s, c) => s + c.consumoMesBrl, 0))}
          hint="todos os fornecedores"
        />
      </div>

      {data.carteiras.map((c) => (
        <CarteiraCard key={c.def.key} carteira={c} podeEditar={podeEditar} />
      ))}

      {podeEditar && <AlertaConfig alertaPercent={data.alertaPercent} bloqueio={data.bloqueio} />}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <PiggyBank className="h-4 w-4" />
        Os fornecedores não expõem saldo por API: os aportes são lançados manualmente e o consumo vem dos eventos já
        registrados pela plataforma.
      </p>
    </div>
  );
}
