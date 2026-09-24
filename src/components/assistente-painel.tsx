import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, Copy, History, MoreVertical, Send, SquarePen, Square, Trash2, WandSparkles } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStudio } from "./studio-context";
import { VoiceDictationButton } from "./voice-dictation-button";

type Msg = { id?: string; papel: "user" | "assistant" | "aviso" | "erro"; conteudo: string; pergunta?: string };
type Conversa = { id: string; titulo: string; atualizado_em: string };

const TOOL_LABELS: Record<string, string> = {
  listar_perfis: "Consultando perfis...", resumo_pipeline: "Consultando pipeline...", listar_jobs: "Consultando jobs...",
  detalhe_job: "Consultando o job...", ultimo_video: "Consultando vídeos...", resumo_custos: "Consultando custos...",
  saldo_carteira: "Consultando saldo...", listar_agendas: "Consultando automação...", listar_produtos: "Consultando produtos...",
  buscar_no_manual: "Consultando o manual...",
};

const SUGESTOES: Record<string, string[]> = {
  "/app": ["Como está meu pipeline?", "Quanto gastei este mês?", "Qual foi o último vídeo publicado?", "Qual é meu saldo?"],
  "/app/rascunhos": ["Quais vídeos estão aguardando revisão?", "Qual foi o último vídeo pronto?", "Como aprovo um rascunho?", "Quantos vídeos publiquei este mês?"],
  "/app/pipeline": ["Algum job travou com erro?", "Quantos jobs estão gerando agora?", "Liste os jobs com roteiro pronto", "O que significa cada etapa?"],
  "/app/custos": ["Quanto gastei este mês?", "Qual etapa mais gasta?", "Quanto gastei nos últimos 7 dias?", "Quanto falta do orçamento?"],
  "/app/produtos": ["Quais produtos têm maior hype?", "Quais produtos já viraram vídeo?", "Como salvo um produto?", "Quais têm maior comissão?"],
  "/app/automacao": ["Minhas agendas estão ativas?", "Alguma agenda pausou por falta de saldo?", "Quando é o próximo disparo?", "Como crio uma agenda?"],
};

/** Esconde o botão onde há tela cheia própria (estúdio de gravação). */
const OCULTAR = (path: string) => !path.startsWith("/app");

function inline(text: string, onLink: (href: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++} className="font-semibold">{m[1]}</strong>);
    else {
      const href = m[3] ?? "";
      out.push(href.startsWith("/")
        ? <a key={k++} href={href} onClick={(e) => { e.preventDefault(); onLink(href); }} className="font-medium text-primary underline underline-offset-2">{m[2]}</a>
        : <a key={k++} href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">{m[2]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const blocos: ReactNode[] = [];
  let lista: { ordered: boolean; itens: string[] } | null = null;
  const flush = () => {
    if (!lista) return;
    const Tag = lista.ordered ? "ol" : "ul";
    blocos.push(<Tag key={blocos.length} className={`${lista.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>{lista.itens.map((it, i) => <li key={i}>{inline(it, onLink)}</li>)}</Tag>);
    lista = null;
  };
  for (const raw of text.split("\n")) {
    const l = raw.trimEnd();
    const ul = /^\s*[-*]\s+(.*)/.exec(l); const ol = /^\s*\d+[.)]\s+(.*)/.exec(l);
    if (ul || ol) {
      const ordered = !!ol;
      if (!lista || lista.ordered !== ordered) { flush(); lista = { ordered, itens: [] }; }
      lista.itens.push((ul ?? ol)![1] ?? "");
      continue;
    }
    flush();
    if (!l.trim()) continue;
    blocos.push(<p key={blocos.length}>{inline(l.replace(/^#+\s*/, ""), onLink)}</p>);
  }
  flush();
  return <div className="space-y-2">{blocos.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Copiar resposta">{ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{ok ? "Copiado" : "Copiar"}</button>;
}

export function AssistentePainel() {
  const { activeProfileId, activeProfile, userId } = useStudio();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [naoLida, setNaoLida] = useState(false);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [toolAtual, setToolAtual] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [limite, setLimite] = useState(0);
  const [historico, setHistorico] = useState<Conversa[] | null>(null);
  const [carregado, setCarregado] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open); openRef.current = open;
  const prevPerfil = useRef<string | null | undefined>(undefined);

  const abrirConversa = useCallback(async (id: string | null) => {
    setConversaId(id); setMsgs([]); setHistorico(null);
    if (!id) return;
    const { data } = await supabase.from("assistente_mensagens").select("id, papel, conteudo").eq("conversa_id", id).order("criado_em");
    setMsgs((data ?? []).map((m) => ({ id: m.id, papel: m.papel as Msg["papel"], conteudo: m.conteudo })));
  }, []);

  // Ao abrir pela primeira vez, carrega a última conversa.
  useEffect(() => {
    if (!open || carregado || !userId) return;
    setCarregado(true);
    void (async () => {
      const { data } = await supabase.from("assistente_conversas").select("id").eq("user_id", userId).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
      if (data) await abrirConversa(data.id);
    })();
  }, [open, carregado, userId, abrirConversa]);

  useEffect(() => { if (open) { setNaoLida(false); setTimeout(() => taRef.current?.focus(), 50); } }, [open]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [msgs, streaming, toolAtual]);
  useEffect(() => { if (limite <= 0) return; const t = setInterval(() => setLimite((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [limite]);
  useEffect(() => { const ta = taRef.current; if (!ta) return; ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 5 * 22 + 16) + "px"; }, [texto, open]);

  // Troca de perfil: avisa na conversa sem apagá-la.
  useEffect(() => {
    const prev = prevPerfil.current; prevPerfil.current = activeProfileId;
    if (prev === undefined || prev === activeProfileId || !conversaId || !msgs.length) return;
    const aviso = `Agora respondendo sobre ${activeProfile?.name ?? "todos os perfis"}`;
    setMsgs((m) => [...m, { papel: "aviso", conteudo: aviso }]);
    void supabase.from("assistente_mensagens").insert({ conversa_id: conversaId, papel: "aviso", conteudo: aviso });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  const onLink = (href: string) => { if (isMobile) setOpen(false); void navigate({ to: href as never }); };

  async function enviar(pergunta: string, reenviar = false) {
    const p = pergunta.trim();
    if (!p || enviando || limite > 0) return;
    if (!reenviar) setMsgs((m) => [...m, { papel: "user", conteudo: p }]);
    else setMsgs((m) => m.filter((x) => x.papel !== "erro"));
    setTexto(""); setEnviando(true); setStreaming(""); setToolAtual(null);
    const ac = new AbortController(); abortRef.current = ac;
    let acumulado = "";
    const falha = () => setMsgs((m) => [...m, { papel: "erro", conteudo: "Não consegui responder agora.", pergunta: p }]);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/assistente", {
        method: "POST", signal: ac.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ conversaId, pergunta: p, profileId: activeProfileId, rota: path, reenviar }),
      });
      if (!res.ok || !res.body) { falha(); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let terminou = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; id?: string; nome?: string; x?: string; texto?: string; msg?: string; segundos?: number };
          if (ev.t === "conversa" && ev.id) setConversaId(ev.id);
          else if (ev.t === "tool") setToolAtual(TOOL_LABELS[ev.nome ?? ""] ?? "Consultando...");
          else if (ev.t === "delta") { acumulado += ev.x ?? ""; setToolAtual(null); setStreaming(acumulado); }
          else if (ev.t === "fim") { terminou = true; setMsgs((m) => [...m, { papel: "assistant" as const, conteudo: ev.texto ?? acumulado }]); if (!openRef.current) setNaoLida(true); }
          else if (ev.t === "limite") { terminou = true; setLimite(ev.segundos ?? 60); setMsgs((m) => m.slice(0, -1)); setTexto(p); }
          else if (ev.t === "erro") { terminou = true; falha(); }
        }
      }
      if (!terminou) falha();
    } catch {
      if (ac.signal.aborted) { if (acumulado) setMsgs((m) => [...m, { papel: "assistant", conteudo: acumulado }]); }
      else falha();
    } finally {
      setEnviando(false); setStreaming(null); setToolAtual(null); abortRef.current = null;
      setTimeout(() => taRef.current?.focus(), 30);
    }
  }

  async function verHistorico() {
    const { data } = await supabase.from("assistente_conversas").select("id, titulo, atualizado_em").order("atualizado_em", { ascending: false }).limit(30);
    setHistorico(data ?? []);
  }
  async function apagar(id: string) {
    await supabase.from("assistente_conversas").delete().eq("id", id);
    setHistorico((h) => h?.filter((c) => c.id !== id) ?? null);
    if (id === conversaId) { setConversaId(null); setMsgs([]); }
  }

  if (OCULTAR(path)) return null;
  const sugestoes = SUGESTOES[path] ?? SUGESTOES["/app"] ?? [];
  const fmtMin = (s: number) => s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Abrir assistente"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:border-muted-foreground md:bottom-6 md:right-6">
      <WandSparkles className="h-5 w-5" />
      {naoLida && <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-card bg-brand-cyan" aria-label="Resposta não lida" />}
    </button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px] [&>button]:hidden">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <SheetTitle className="font-display text-base font-semibold">Assistente</SheetTitle>
            <SheetDescription className="truncate text-xs text-muted-foreground">Perfil: {activeProfile?.name ?? "todos os perfis"}</SheetDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Nova conversa" onClick={() => void abrirConversa(null)} disabled={enviando}><SquarePen className="h-4 w-4" /></Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Mais opções"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void verHistorico()}><History className="h-4 w-4" />Histórico</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setOpen(false)}><span className="text-lg leading-none">×</span></Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
          {historico ? (
            <div className="grid gap-1">
              <div className="mb-2 flex items-center justify-between"><p className="font-semibold">Histórico</p><Button variant="ghost" size="sm" onClick={() => setHistorico(null)}>Voltar</Button></div>
              {historico.length === 0 && <p className="text-muted-foreground">Nenhuma conversa salva ainda.</p>}
              {historico.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void abrirConversa(c.id)}>
                    <span className="block truncate">{c.titulo}</span>
                    <span className="text-xs text-muted-foreground">{new Date(c.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </button>
                  <Button variant="ghost" size="icon" aria-label="Apagar conversa" onClick={() => void apagar(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          ) : msgs.length === 0 && streaming === null ? (
            <div className="grid gap-2">
              <p className="mb-2 text-muted-foreground">Pergunte sobre seus perfis, vídeos, custos e automações.</p>
              {sugestoes.map((s) => <button key={s} type="button" onClick={() => void enviar(s)} className="rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-muted-foreground">{s}</button>)}
            </div>
          ) : (
            <div className="grid gap-3">
              {msgs.map((m, i) => m.papel === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-foreground">{m.conteudo}</div>
              ) : m.papel === "aviso" ? (
                <p key={i} className="text-center text-xs text-muted-foreground">{m.conteudo}</p>
              ) : m.papel === "erro" ? (
                <div key={i} className="max-w-[90%] rounded-lg border border-border bg-card px-3 py-2">
                  Não consegui responder agora. <button type="button" className="font-medium text-primary underline" onClick={() => void enviar(m.pergunta ?? "", true)} disabled={!m.pergunta || enviando}>Tentar de novo</button>
                </div>
              ) : (
                <div key={i} className="max-w-[90%] rounded-lg border border-border bg-card px-3 py-2"><Markdown text={m.conteudo} onLink={onLink} /><CopyBtn text={m.conteudo} /></div>
              ))}
              {streaming !== null && (
                <div className="max-w-[90%]">
                  {(toolAtual || !streaming) && <p className="mb-1 text-xs text-muted-foreground">{toolAtual ?? "Pensando..."}</p>}
                  {streaming && <div className="rounded-lg border border-border bg-card px-3 py-2"><Markdown text={streaming} onLink={onLink} /></div>}
                </div>
              )}
              <div ref={fimRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {limite > 0 && <p className="mb-2 text-xs text-muted-foreground">Você atingiu o limite de mensagens. Tente de novo em {fmtMin(limite)}.</p>}
          <div className="flex items-end gap-2">
            <textarea ref={taRef} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte algo..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
              className="min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-[22px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <VoiceDictationButton compact profileId={activeProfileId} disabled={enviando} onText={(t) => setTexto((v) => (v ? v + " " : "") + t)} />
            {enviando
              ? <Button size="icon" variant="secondary" aria-label="Parar" onClick={() => abortRef.current?.abort()}><Square className="h-4 w-4 fill-current" /></Button>
              : <Button size="icon" aria-label="Enviar" onClick={() => void enviar(texto)} disabled={!texto.trim() || limite > 0}><Send className="h-4 w-4" /></Button>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
