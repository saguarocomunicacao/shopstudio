/**
 * Tela "Automação": configuração das agendas de geração automática de vídeos
 * por IA. Parte 1 — aqui só se cria, edita, ativa/pausa e remove agendas.
 * Nenhuma geração é disparada nesta parte.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfileGate } from "./profile-gate";
import { useStudio } from "./studio-context";
import { useProfileAvatars } from "./avatar-library";
import { useVoices } from "@/lib/voices";
import {
  AVATAR_MODO_LABELS,
  FONTE_LABELS,
  LANCAMENTO_LABELS,
  PERIODO_LABELS,
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

/** Máscara de R$ para campos de dinheiro: armazena centavos, exibe "R$ 30,00". */
const brlMask = (cents: number | null) =>
  cents === null || cents === undefined ? "" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Converte o texto mascarado de volta a centavos; vazio => null. */
const toCentsMask = (v: string): number | null => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
};
const numOrNull = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

type FormState = {
  id?: string;
  nome: string;
  horarios: string[];
  fonte: AutomationFonte;
  comissao_min: string;
  preco_min: string;
  preco_max: string;
  receita_min: string;
  lancamento: string;
  periodo: string;
  palavra_chave: string;
  avatar_modo: AutomationAvatarModo;
  avatar_id: string | null;
  voice_ref: string | null;
  cenas_count: string;
  take_duration: string;
  qualidade: string;
  teto_diario: number | null;
  teto_mensal: number | null;
};

const emptyForm = (): FormState => ({
  nome: "Agenda de automação",
  horarios: ["09:00"],
  fonte: "garimpo",
  comissao_min: "",
  preco_min: "",
  preco_max: "",
  receita_min: "",
  lancamento: "qualquer",
  periodo: "last7Day",
  palavra_chave: "",
  avatar_modo: "perfil",
  avatar_id: null,
  voice_ref: null,
  cenas_count: "",
  take_duration: "",
  qualidade: "herdar",
  teto_diario: null,
  teto_mensal: null,
});

const formFrom = (s: AutomationSchedule): FormState => ({
  id: s.id,
  nome: s.nome,
  horarios: s.horarios.length ? s.horarios : ["09:00"],
  fonte: s.fonte,
  comissao_min: s.filtros.comissao_min != null ? String(s.filtros.comissao_min) : "",
  preco_min: s.filtros.preco_min != null ? String(s.filtros.preco_min) : "",
  preco_max: s.filtros.preco_max != null ? String(s.filtros.preco_max) : "",
  receita_min: s.filtros.receita_min != null ? String(s.filtros.receita_min) : "",
  lancamento: s.filtros.lancamento ?? "qualquer",
  periodo: s.filtros.periodo ?? "last7Day",
  palavra_chave: s.filtros.palavra_chave ?? "",
  avatar_modo: s.avatar_modo,
  avatar_id: s.avatar_id,
  voice_ref: s.voice_ref,
  cenas_count: s.cenas_count != null ? String(s.cenas_count) : "",
  take_duration: s.take_duration != null ? String(s.take_duration) : "",
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
          comissao_min: numOrNull(form.comissao_min),
          preco_min: numOrNull(form.preco_min),
          preco_max: numOrNull(form.preco_max),
          receita_min: numOrNull(form.receita_min),
          lancamento: form.lancamento === "qualquer" ? null : (form.lancamento as never),
          periodo: form.periodo as never,
          palavra_chave: form.palavra_chave.trim() || null,
        },
        avatar_modo: form.avatar_modo,
        avatar_id: form.avatar_modo === "biblioteca" ? form.avatar_id : null,
        voice_ref: form.voice_ref,
        cenas_count: form.cenas_count.trim() ? Number(form.cenas_count) : null,
        take_duration: form.take_duration.trim() ? Number(form.take_duration) : null,
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
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
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
                <Input inputMode="decimal" value={form.comissao_min} onChange={(e) => set("comissao_min", e.target.value)} placeholder="Ex.: 15" />
              </div>
              <div className="space-y-1.5">
                <Label>Receita mínima (R$)</Label>
                <Input inputMode="decimal" value={form.receita_min} onChange={(e) => set("receita_min", e.target.value)} placeholder="Ex.: 5000" />
              </div>
              <div className="space-y-1.5">
                <Label>Preço mínimo (R$)</Label>
                <Input inputMode="decimal" value={form.preco_min} onChange={(e) => set("preco_min", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço máximo (R$)</Label>
                <Input inputMode="decimal" value={form.preco_max} onChange={(e) => set("preco_max", e.target.value)} />
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
                <Input type="number" min={1} max={12} value={form.cenas_count} onChange={(e) => set("cenas_count", e.target.value)} placeholder="Herdar do perfil" />
              </div>
              <div className="space-y-1.5">
                <Label>Duração de cada cena (s)</Label>
                <Input type="number" min={2} max={15} value={form.take_duration} onChange={(e) => set("take_duration", e.target.value)} placeholder="Herdar do perfil" />
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
                <Input inputMode="decimal" value={form.teto_diario} onChange={(e) => set("teto_diario", e.target.value)} placeholder="Sem limite" />
              </div>
              <div className="space-y-1.5">
                <Label>Limite por mês (R$)</Label>
                <Input inputMode="decimal" value={form.teto_mensal} onChange={(e) => set("teto_mensal", e.target.value)} placeholder="Sem limite" />
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
      </DialogContent>
    </Dialog>
  );
}

function AutomationContent() {
  const { activeProfileId, activeProfile } = useStudio();
  const { data: schedules = [], isLoading } = useAutomationSchedules(activeProfileId);
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agenda</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Horários</TableHead>
              <TableHead>Vídeos/dia</TableHead>
              <TableHead>Teto diário</TableHead>
              <TableHead>Teto mensal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && !schedules.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  <Bot className="mx-auto mb-2 h-6 w-6" />
                  Nenhuma agenda ainda. Crie a primeira para configurar a automação deste perfil.
                </TableCell>
              </TableRow>
            )}
            {schedules.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">{s.nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.fonte === "radar" ? "Radar de emergentes" : "Garimpo normal"}</TableCell>
                <TableCell className="text-sm">{s.horarios.join(", ")}</TableCell>
                <TableCell>{s.videos_por_dia}</TableCell>
                <TableCell>{brlFromCents(s.teto_diario_cents)}</TableCell>
                <TableCell>{brlFromCents(s.teto_mensal_cents)}</TableCell>
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
                  {s.pausada_motivo && <p className="mt-1 text-xs text-muted-foreground">{s.pausada_motivo}</p>}
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
            ))}
          </TableBody>
        </Table>
      </div>

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

export function AutomationPage() {
  return (
    <ProfileGate>
      <AutomationContent />
    </ProfileGate>
  );
}
