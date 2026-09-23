/**
 * Tela "Automação": configuração das agendas de geração automática de vídeos
 * por IA. Parte 1 — aqui só se cria, edita, ativa/pausa e remove agendas.
 * Nenhuma geração é disparada nesta parte.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bot, CalendarClock, ExternalLink, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";
import { useProfileAvatars } from "./avatar-library";
import { useVoices } from "@/lib/voices";
import {
  AVATAR_MODO_LABELS,
  FONTE_LABELS,
  LANCAMENTO_LABELS,
  PERIODO_LABELS,
  useAutomationInsights,
  useAutomationRuns,
  useAutomationSchedules,

  useDeleteSchedule,
  useSaveSchedule,
  useToggleSchedule,
  type AutomationAvatarModo,
  type AutomationFonte,
  type AutomationSchedule,
} from "@/lib/automation";

const brlFromCents = (v: number | null) =>
  v === null || v === undefined ? "—" : (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const nextRunLabel = (schedule: AutomationSchedule) => {
  if (!schedule.ativa) return "Sem próximo disparo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const nowMinutes = hour * 60 + minute;
  const times = schedule.horarios
    .map((time) => ({ time, minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) }))
    .filter((item) => Number.isFinite(item.minutes))
    .sort((a, b) => a.minutes - b.minutes);
  const today = times.find((item) => item.minutes > nowMinutes);
  return today ? `Hoje, ${today.time}` : times[0] ? `Amanhã, ${times[0].time}` : "Horário não definido";
};

function SpendProgress({ label, value, ceilingCents }: { label: string; value: number; ceilingCents: number | null }) {
  const ceiling = ceilingCents === null ? null : ceilingCents / 100;
  const percent = ceiling && ceiling > 0 ? Math.min(100, (value / ceiling) * 100) : 0;
  return (
    <div className="min-w-[190px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="whitespace-nowrap text-muted-foreground">
          {ceiling === null ? `${brl(value)} · sem teto` : `${brl(value)} de ${brl(ceiling)}`}
        </span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Máscaras / conversores de campos numéricos e monetários
 * ------------------------------------------------------------------ */

/** Máscara R$ para CENTAVOS (tetos de gasto): exibe "R$ 30,00". */
const brlMaskCents = (cents: number | null) =>
  cents === null || cents === undefined ? "" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toCentsMask = (v: string): number | null => {
  const digits = v.replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

/** Máscara R$ para REAIS (filtros de preço/receita): exibe "R$ 5.000,00". */
const brlMaskReais = (reais: number | null) =>
  reais === null || reais === undefined ? "" : reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toReaisMask = (v: string): number | null => {
  const digits = v.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : null;
};

/** Percentual (%): aceita só dígitos e vírgula, exibe "15" ou "15,5". */
const percentMask = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const toPercentMask = (v: string): number | null => {
  const clean = v.replace(/[^0-9,]/g, "").replace(/,+/g, ",");
  if (!clean || clean === ",") return null;
  const n = Number(clean.replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

/** Inteiro positivo: aceita só dígitos. */
const intMask = (v: number | null) => (v === null || v === undefined ? "" : String(v));
const toIntMask = (v: string): number | null => {
  const digits = v.replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

type FormState = {
  id?: string;
  nome: string;
  horarios: string[];
  fonte: AutomationFonte;
  comissao_min: number | null;
  preco_min: number | null;
  preco_max: number | null;
  receita_min: number | null;
  lancamento: string;
  periodo: string;
  palavra_chave: string;
  avatar_modo: AutomationAvatarModo;
  avatar_id: string | null;
  voice_ref: string | null;
  cenas_count: number | null;
  take_duration: number | null;
  qualidade: string;
  teto_diario: number | null;
  teto_mensal: number | null;
};

const emptyForm = (): FormState => ({
  nome: "Agenda de automação",
  horarios: ["09:00"],
  fonte: "garimpo",
  comissao_min: null,
  preco_min: null,
  preco_max: null,
  receita_min: null,
  lancamento: "qualquer",
  periodo: "last7Day",
  palavra_chave: "",
  avatar_modo: "perfil",
  avatar_id: null,
  voice_ref: null,
  cenas_count: null,
  take_duration: null,
  qualidade: "herdar",
  teto_diario: null,
  teto_mensal: null,
});

const formFrom = (s: AutomationSchedule): FormState => ({
  id: s.id,
  nome: s.nome,
  horarios: s.horarios.length ? s.horarios : ["09:00"],
  fonte: s.fonte,
  comissao_min: s.filtros.comissao_min ?? null,
  preco_min: s.filtros.preco_min ?? null,
  preco_max: s.filtros.preco_max ?? null,
  receita_min: s.filtros.receita_min ?? null,
  lancamento: s.filtros.lancamento ?? "qualquer",
  periodo: s.filtros.periodo ?? "last7Day",
  palavra_chave: s.filtros.palavra_chave ?? "",
  avatar_modo: s.avatar_modo,
  avatar_id: s.avatar_id,
  voice_ref: s.voice_ref,
  cenas_count: s.cenas_count ?? null,
  take_duration: s.take_duration ?? null,
  qualidade: s.qualidade ?? "herdar",
  teto_diario: s.teto_diario_cents,
  teto_mensal: s.teto_mensal_cents,
});

function ScheduleDialog({
  open,
  onOpenChange,
  profileId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  initial: AutomationSchedule | null;
}) {
  const [form, setForm] = useState<FormState>(() => (initial ? formFrom(initial) : emptyForm()));
  const { data: avatars = [] } = useProfileAvatars(profileId);
  const { data: voices = [] } = useVoices(profileId);
  const save = useSaveSchedule();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const horarios = form.horarios.filter(Boolean);
    if (!horarios.length) {
      toast.error("Defina ao menos um horário de disparo.");
      return;
    }
    // Validação de campos numéricos/monetários
    if (form.comissao_min !== null && (form.comissao_min < 0 || form.comissao_min > 100)) {
      toast.error("Comissão mínima deve ser entre 0 e 100%.");
      return;
    }
    if (form.cenas_count !== null && (!Number.isInteger(form.cenas_count) || form.cenas_count < 1 || form.cenas_count > 12)) {
      toast.error("Número de cenas deve ser um inteiro entre 1 e 12.");
      return;
    }
    if (form.take_duration !== null && (!Number.isInteger(form.take_duration) || form.take_duration < 2 || form.take_duration > 15)) {
      toast.error("Duração de cada cena deve ser um inteiro entre 2 e 15 segundos.");
      return;
    }
    if (form.preco_min !== null && form.preco_max !== null && form.preco_min > form.preco_max) {
      toast.error("Preço mínimo não pode ser maior que o preço máximo.");
      return;
    }
    if (form.teto_diario !== null && form.teto_diario <= 0) {
      toast.error("Limite por dia deve ser maior que zero.");
      return;
    }
    if (form.teto_mensal !== null && form.teto_mensal <= 0) {
      toast.error("Limite por mês deve ser maior que zero.");
      return;
    }
    save.mutate(
      {
        id: form.id,
        profile_id: profileId,
        nome: form.nome.trim() || "Agenda de automação",
        ativa: initial?.ativa ?? false,
        videos_por_dia: horarios.length,
        horarios,
        fonte: form.fonte,
        filtros: {
          comissao_min: form.comissao_min,
          preco_min: form.preco_min,
          preco_max: form.preco_max,
          receita_min: form.receita_min,
          lancamento: form.lancamento === "qualquer" ? null : (form.lancamento as never),
          periodo: form.periodo as never,
          palavra_chave: form.palavra_chave.trim() || null,
        },
        avatar_modo: form.avatar_modo,
        avatar_id: form.avatar_modo === "biblioteca" ? form.avatar_id : null,
        voice_ref: form.voice_ref,
        cenas_count: form.cenas_count,
        take_duration: form.take_duration,
        qualidade: form.qualidade === "herdar" ? null : form.qualidade,
        teto_diario_cents: form.teto_diario,
        teto_mensal_cents: form.teto_mensal,
      },
      {
        onSuccess: () => {
          toast.success("Agenda salva.");
          onOpenChange(false);
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col overflow-hidden p-0">
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar agenda" : "Nova agenda"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label>Nome da agenda</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">Quando rodar</h3>
            <div className="space-y-2">
              <Label>Horários de disparo</Label>
              <div className="flex flex-wrap gap-2">
                {form.horarios.map((h, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={h}
                      className="w-[120px]"
                      onChange={(e) =>
                        set("horarios", form.horarios.map((old, j) => (j === i ? e.target.value : old)))
                      }
                    />
                    {form.horarios.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set("horarios", form.horarios.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => set("horarios", [...form.horarios, "12:00"])}>
                  <Plus className="mr-1.5 h-4 w-4" /> Horário
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada horário abaixo gera um vídeo. {form.horarios.filter(Boolean).length} horário(s) = {form.horarios.filter(Boolean).length} vídeo(s) por dia. Horário de Brasília, é quando a geração começa a rodar.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">De onde vem o produto</h3>
            <div className="space-y-1.5">
              <Label>Fonte do garimpo</Label>
              <Select value={form.fonte} onValueChange={(v) => set("fonte", v as AutomationFonte)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FONTE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Comissão mínima (%)</Label>
                <Input
                  inputMode="decimal"
                  value={percentMask(form.comissao_min)}
                  onChange={(e) => set("comissao_min", toPercentMask(e.target.value))}
                  placeholder="Ex.: 15"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Receita mínima (R$)</Label>
                <Input
                  inputMode="numeric"
                  value={brlMaskReais(form.receita_min)}
                  onChange={(e) => set("receita_min", toReaisMask(e.target.value))}
                  placeholder="R$ 5.000,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Preço mínimo (R$)</Label>
                <Input
                  inputMode="numeric"
                  value={brlMaskReais(form.preco_min)}
                  onChange={(e) => set("preco_min", toReaisMask(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Preço máximo (R$)</Label>
                <Input
                  inputMode="numeric"
                  value={brlMaskReais(form.preco_max)}
                  onChange={(e) => set("preco_max", toReaisMask(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Período analisado</Label>
                <Select value={form.periodo} onValueChange={(v) => set("periodo", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIODO_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Lançamento</Label>
                <Select value={form.lancamento} onValueChange={(v) => set("lancamento", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualquer">Qualquer data</SelectItem>
                    {Object.entries(LANCAMENTO_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Palavra-chave (opcional)</Label>
                <Input value={form.palavra_chave} onChange={(e) => set("palavra_chave", e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A automação escolhe sempre o próximo produto que passa nesses filtros e que ainda não virou vídeo neste perfil.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">Como o vídeo é gerado</h3>
            <p className="text-xs text-muted-foreground">Em branco, a agenda herda o que já está configurado no perfil.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pessoa nas cenas</Label>
                <Select value={form.avatar_modo} onValueChange={(v) => set("avatar_modo", v as AutomationAvatarModo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AVATAR_MODO_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.avatar_modo === "biblioteca" && (
                <div className="space-y-1.5">
                  <Label>Avatar da biblioteca</Label>
                  <Select value={form.avatar_id ?? ""} onValueChange={(v) => set("avatar_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Escolher avatar" /></SelectTrigger>
                    <SelectContent>
                      {avatars.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Voz da narração</Label>
                <Select value={form.voice_ref ?? "perfil"} onValueChange={(v) => set("voice_ref", v === "perfil" ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perfil">Voz do perfil</SelectItem>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Número de cenas</Label>
                <Input
                  inputMode="numeric"
                  value={intMask(form.cenas_count)}
                  onChange={(e) => set("cenas_count", toIntMask(e.target.value))}
                  placeholder="Herdar do perfil"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duração de cada cena (s)</Label>
                <Input
                  inputMode="numeric"
                  value={intMask(form.take_duration)}
                  onChange={(e) => set("take_duration", toIntMask(e.target.value))}
                  placeholder="Herdar do perfil"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qualidade</Label>
                <Select value={form.qualidade} onValueChange={(v) => set("qualidade", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="herdar">Herdar do perfil</SelectItem>
                    <SelectItem value="padrao">Padrão (mais barato)</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">Teto de gasto da automação</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Limite por dia (R$)</Label>
                <Input
                  inputMode="numeric"
                  value={brlMaskCents(form.teto_diario)}
                  onChange={(e) => set("teto_diario", toCentsMask(e.target.value))}
                  placeholder="Sem limite"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Limite por mês (R$)</Label>
                <Input
                  inputMode="numeric"
                  value={brlMaskCents(form.teto_mensal)}
                  onChange={(e) => set("teto_mensal", toCentsMask(e.target.value))}
                  placeholder="Sem limite"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Esse limite é só da automação e soma ao teto de orçamento geral. Ao atingir, a agenda pausa sozinha.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar agenda"}</Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AutomationContent() {
  const { activeProfileId, activeProfile } = useStudio();
  const { data: schedules = [], isLoading } = useAutomationSchedules(activeProfileId);
  const { data: runs = [], isLoading: runsLoading } = useAutomationRuns(activeProfileId);
  const { data: insights, isLoading: insightsLoading } = useAutomationInsights(activeProfileId, runs);
  const toggle = useToggleSchedule();
  const remove = useDeleteSchedule();
  const [dialog, setDialog] = useState<{ open: boolean; initial: AutomationSchedule | null }>({ open: false, initial: null });
  const [removing, setRemoving] = useState<AutomationSchedule | null>(null);

  const ativas = useMemo(() => schedules.filter((s) => s.ativa).length, [schedules]);

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 border-l-4 border-l-primary sm:flex-row sm:items-start">
        <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-bold">A automação gera vídeos por IA de verdade, com custo real.</p>
          <p className="mt-1 text-muted-foreground">
            Cada vídeo criado pela agenda para em <strong>Aguardando revisão</strong>, nos Rascunhos, para você conferir
            antes de postar. Nada é publicado sozinho.
          </p>
        </div>
      </div>

      <Tabs defaultValue="agendamentos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
          <TabsTrigger value="execucoes">Últimas execuções</TabsTrigger>
        </TabsList>

        <TabsContent value="agendamentos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Agendas de {activeProfile?.name ?? "perfil"}</h2>
          <p className="text-sm text-muted-foreground">
            {schedules.length} agenda(s) · {ativas} ativa(s)
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true, initial: null })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova agenda
        </Button>
      </div>

      <div className="panel overflow-x-auto p-0">
        <Table className="min-w-[1040px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Agenda</TableHead>
              <TableHead className="w-[19%]">Programação</TableHead>
              <TableHead className="w-[27%]">Gasto vs. teto</TableHead>
              <TableHead className="w-[15%]">Vídeos gerados</TableHead>
              <TableHead className="w-[15%]">Status</TableHead>
              <TableHead className="w-[6%] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && !schedules.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  <Bot className="mx-auto mb-2 h-6 w-6" />
                  Nenhuma agenda ainda. Crie a primeira para configurar a automação deste perfil.
                </TableCell>
              </TableRow>
            )}
            {schedules.map((s) => {
              const detail = insights?.schedules.get(s.id);
              const noProduct = detail?.latestRunStatus === "sem_produto";
              return (
              <TableRow key={s.id} className="align-top">
                <TableCell>
                  <p className="font-semibold">{s.nome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.fonte === "radar" ? "Radar de emergentes" : "Garimpo normal"}</p>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{s.horarios.join(", ")}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" /> {nextRunLabel(s)}
                  </p>
                </TableCell>
                <TableCell className="space-y-3">
                  <SpendProgress label="Hoje" value={detail?.costTodayBrl ?? 0} ceilingCents={s.teto_diario_cents} />
                  <SpendProgress label="Mês" value={detail?.costMonthBrl ?? 0} ceilingCents={s.teto_mensal_cents} />
                </TableCell>
                <TableCell>
                  <p className="text-sm font-bold tabular-nums">{detail?.videosToday ?? 0} hoje</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {detail?.videosMonth ?? 0} no mês · {detail?.videosTotal ?? 0} total
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label="Ativar agenda"
                      checked={s.ativa}
                      onCheckedChange={(v) => toggle.mutate({ id: s.id, ativa: v })}
                    />
                    <span className={`text-xs font-semibold ${s.ativa ? "text-primary" : "text-muted-foreground"}`}>
                      {s.ativa ? "Ativa" : "Pausada"}
                    </span>
                  </div>
                  {s.pausada_motivo && (
                    <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
                      Pausa automática: {s.pausada_motivo}
                    </p>
                  )}
                  {!s.pausada_motivo && noProduct && (
                    <p className="mt-2 rounded-md bg-secondary px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Produtos novos esgotados para os filtros atuais.
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setDialog({ open: true, initial: s })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setRemoving(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
        </TabsContent>

        <TabsContent value="execucoes">
          <RunsLog
            profileId={activeProfileId}
            schedules={schedules}
            runs={runs}
            insights={insights}
            isLoading={runsLoading || insightsLoading}
          />
        </TabsContent>
      </Tabs>




      {dialog.open && activeProfileId && (
        <ScheduleDialog
          key={dialog.initial?.id ?? "nova"}
          open={dialog.open}
          onOpenChange={(v) => setDialog({ open: v, initial: v ? dialog.initial : null })}
          profileId={activeProfileId}
          initial={dialog.initial}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              A agenda “{removing?.nome}” será apagada. Os vídeos já criados continuam nos Rascunhos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) remove.mutate(removing.id, { onSuccess: () => toast.success("Agenda removida.") });
                setRemoving(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const RUN_LABEL: Record<string, string> = {
  gerando: "Gerando",
  concluido: "Concluída",
  falhou: "Falhou",
  sem_produto: "Sem produto novo",
  pausado: "Pausada por teto",
};

const RUN_BADGE: Record<string, string> = {
  gerando: "bg-primary/10 text-primary",
  concluido: "bg-primary/10 text-primary",
  falhou: "bg-destructive/10 text-destructive",
  sem_produto: "bg-secondary text-muted-foreground",
  pausado: "bg-destructive/10 text-destructive",
};

type RunPeriod = "hoje" | "mes" | "30dias" | "todos";
type RunResult = "todos" | "gerou" | "pausado" | "sem_produto" | "falhou";

function dateKeyBrasilia(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function RunsLog({
  profileId,
  schedules,
  runs,
  insights,
  isLoading,
}: {
  profileId: string | null;
  schedules: AutomationSchedule[];
  runs: import("@/lib/automation").AutomationRun[];
  insights: import("@/lib/automation").AutomationInsights | undefined;
  isLoading: boolean;
}) {
  const [scheduleFilter, setScheduleFilter] = useState("todas");
  const [period, setPeriod] = useState<RunPeriod>("mes");
  const [result, setResult] = useState<RunResult>("todos");
  const today = dateKeyBrasilia(new Date());
  const month = today.slice(0, 7);
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 29);
  const cutoff30Key = dateKeyBrasilia(cutoff30);
  const inPeriod = (date: string) => {
    const key = dateKeyBrasilia(date);
    if (period === "hoje") return key === today;
    if (period === "mes") return key.slice(0, 7) === month;
    if (period === "30dias") return key >= cutoff30Key;
    return true;
  };
  const matchesResult = (status: string) => {
    if (result === "todos") return true;
    if (result === "gerou") return status === "concluido" || status === "gerando";
    return status === result;
  };
  const filteredRuns = runs.filter(
    (run) => (scheduleFilter === "todas" || run.schedule_id === scheduleFilter) && inPeriod(run.created_at) && matchesResult(run.status),
  );
  const periodJobs = [...(insights?.jobs.values() ?? [])].filter(
    (job) => (scheduleFilter === "todas" || job.scheduleId === scheduleFilter) && inPeriod(job.createdAt),
  );
  const periodCost = periodJobs.reduce((total, job) => total + job.costBrl, 0);
  const costsBySchedule = schedules
    .map((schedule) => ({
      id: schedule.id,
      name: schedule.nome,
      value: periodJobs.filter((job) => job.scheduleId === schedule.id).reduce((total, job) => total + job.costBrl, 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">Últimas execuções</h2>
        <p className="text-sm text-muted-foreground">
          Cada vez que o robô roda um horário da agenda, ele registra o resultado aqui.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold text-muted-foreground">Gasto hoje</p>
          <p className="mt-1 text-2xl font-black text-primary">{brl(insights?.totalTodayBrl ?? 0)}</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold text-muted-foreground">Gasto no mês</p>
          <p className="mt-1 text-2xl font-black">{brl(insights?.totalMonthBrl ?? 0)}</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold text-muted-foreground">Gasto no período filtrado</p>
          <p className="mt-1 text-2xl font-black">{brl(periodCost)}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground">
        <Wallet className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>Esta é uma visão recortada do mesmo consumo registrado em Custos. Nenhum valor é contabilizado duas vezes.</p>
      </div>
      {costsBySchedule.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {costsBySchedule.map((item) => (
            <span key={item.id} className="rounded-full bg-secondary px-3 py-1.5 text-xs">
              <strong>{item.name}</strong> · {brl(item.value)}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
          <SelectTrigger><SelectValue placeholder="Todas as agendas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as agendas</SelectItem>
            {schedules.map((schedule) => <SelectItem key={schedule.id} value={schedule.id}>{schedule.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(value) => setPeriod(value as RunPeriod)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="30dias">Últimos 30 dias</SelectItem>
            <SelectItem value="todos">Todo o período</SelectItem>
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={(value) => setResult(value as RunResult)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os resultados</SelectItem>
            <SelectItem value="gerou">Gerou vídeo</SelectItem>
            <SelectItem value="pausado">Pausou por teto</SelectItem>
            <SelectItem value="sem_produto">Sem produto novo</SelectItem>
            <SelectItem value="falhou">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="panel overflow-x-auto p-0">
        <Table className="min-w-[920px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Agenda</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Produto escolhido</TableHead>
              <TableHead className="text-right">Custo do vídeo</TableHead>
              <TableHead className="text-right">Vídeo</TableHead>
              <TableHead>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && !filteredRuns.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  <Bot className="mx-auto mb-2 h-6 w-6" />
                  {runs.length ? "Nenhuma execução corresponde aos filtros." : "Nenhuma execução ainda. Quando uma agenda ativa chegar no horário, o resultado aparece aqui."}
                </TableCell>
              </TableRow>
            )}
            {filteredRuns.map((r) => {
              const job = r.job_id ? insights?.jobs.get(r.job_id) : undefined;
              const schedule = schedules.find((item) => item.id === r.schedule_id);
              return (
              <TableRow key={r.id} className="align-top">
                <TableCell className="whitespace-nowrap font-medium">{r.dia.split("-").reverse().join("/")}</TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">{r.horario}</TableCell>
                <TableCell className="text-sm font-medium">{schedule?.nome ?? "Agenda removida"}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${RUN_BADGE[r.status] ?? "bg-secondary text-muted-foreground"}`}>
                    {RUN_LABEL[r.status] ?? r.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{job?.productName ?? (r.job_id ? job?.title ?? "Produto associado" : "—")}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-bold tabular-nums">{r.job_id ? brl(job?.costBrl ?? 0) : "—"}</TableCell>
                <TableCell className="text-right">
                  {r.job_id && profileId ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/app/rascunhos" search={{ jobId: r.job_id, perfil: profileId }}>
                        Abrir <ExternalLink className="ml-1 size-3.5" />
                      </Link>
                    </Button>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.mensagem ?? "—"}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


export function AutomationPage() {
  return (
    <ProfileGate>
      <AutomationContent />
    </ProfileGate>
  );
}
