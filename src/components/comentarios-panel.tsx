import { useMemo, useState } from "react";
import { plural } from "@/lib/plural";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Heart, Loader2, MessageCircle, Pin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStudio } from "@/components/studio-context";
import { getComentarios, lerComentarios } from "@/lib/comentarios.functions";
import {
  CATEGORIA_LABEL, CATEGORIAS, QTDS_COMENTARIOS, SUBTIPO_LABEL, contextoComoTexto, custoEstimadoUsd,
  type Bloco, type Categoria, type ComentariosInsights,
} from "@/lib/comentarios-schema";
import { guardarContextoPendente } from "@/lib/contexto-compradores";
import { cn } from "@/lib/utils";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const EM_ANDAMENTO = ["coletando", "processando", "classificando"];
const usd = (n: number) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

export function ComentariosPanel({ url, titulo, origem }: { url: string; titulo?: string | null | undefined; origem?: string | undefined }) {
  const { activeProfileId } = useStudio();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const buscar = useServerFn(getComentarios);
  const ler = useServerFn(lerComentarios);
  const [qtd, setQtd] = useState<50 | 100 | 200>(100);
  const [filtro, setFiltro] = useState<Categoria | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [usarAberto, setUsarAberto] = useState(false);
  const chave = ["comentarios", activeProfileId, url];

  const q = useQuery({
    queryKey: chave,
    enabled: !!activeProfileId && !!url,
    queryFn: () => buscar({ data: { profileId: activeProfileId!, url } }),
    refetchInterval: (query) => (EM_ANDAMENTO.includes((query.state.data as Any)?.coleta?.status) ? 6000 : false),
  });
  const iniciar = useMutation({
    mutationFn: (forcar: boolean) => ler({ data: { profileId: activeProfileId!, url, titulo: titulo ?? null, origem: origem ?? null, qtd, forcar } }),
    onSuccess: () => {
      toast.success("Lendo os comentários. Leva 1 a 2 minutos.");
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const d = q.data as Any;
  const coleta = d?.coleta as Any;
  const ins = d?.insights as ComentariosInsights | null;
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ((d?.comentarios ?? []) as Any[]).filter((c) => (filtro === "todos" || c.categoria === filtro) && (!t || String(c.texto).toLowerCase().includes(t)));
  }, [d, filtro, busca]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of (d?.comentarios ?? []) as Any[]) m.set(c.categoria ?? "irrelevante", (m.get(c.categoria ?? "irrelevante") ?? 0) + 1);
    return m;
  }, [d]);

  if (!activeProfileId) return <p className="text-sm text-muted-foreground">Selecione um perfil no seletor acima.</p>;
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>;
  if (d?.semPermissao) return <p className="text-sm text-muted-foreground">Você não tem permissão para ver comentários neste perfil.</p>;

  const seletor = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border p-0.5">
        {QTDS_COMENTARIOS.map((n) => (
          <button key={n} type="button" onClick={() => setQtd(n)} className={cn("rounded px-2.5 py-1 text-xs font-medium", qtd === n ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{n}</button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Custo estimado: {usd(custoEstimadoUsd(qtd))}</span>
    </div>
  );

  if (!coleta || coleta.status === "erro") {
    return (
      <div className="grid gap-3">
        {coleta?.status === "erro" && <p className="text-sm text-destructive">{coleta.erro ?? "A leitura falhou."}</p>}
        <p className="text-sm text-muted-foreground">Lê os comentários reais do vídeo e separa objeções, dúvidas e desejos dos compradores.</p>
        {seletor}
        <div><Button disabled={!d?.podeEditar || iniciar.isPending} onClick={() => iniciar.mutate(!!coleta)}>{iniciar.isPending ? <Loader2 className="animate-spin" /> : <MessageCircle />}{coleta ? "Tentar novamente" : "Ler comentários"}</Button></div>
        {!d?.podeEditar && <p className="text-xs text-muted-foreground">Você não tem permissão para ler comentários neste perfil.</p>}
      </div>
    );
  }
  if (EM_ANDAMENTO.includes(coleta.status)) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{coleta.status === "classificando" ? "A IA está separando os comentários…" : "Lendo os comentários no TikTok…"}</p>;
  }
  if (coleta.status === "sem_comentarios") {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">Esse vídeo não tem comentários com texto para ler.</p>
        {seletor}
        <div><Button variant="outline" disabled={!d?.podeEditar || iniciar.isPending} onClick={() => iniciar.mutate(true)}>Ler de novo</Button></div>
      </div>
    );
  }

  const usar = () => {
    if (!ins) return;
    guardarContextoPendente(contextoComoTexto(ins, coleta.titulo ?? titulo));
    setUsarAberto(true);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{plural(coleta.n_comentarios, "comentário lido", "comentários lidos")} · {new Date(coleta.updated_at).toLocaleDateString("pt-BR")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!d?.podeEditar || iniciar.isPending} onClick={() => iniciar.mutate(true)}>Ler de novo</Button>
          <Button size="sm" disabled={!ins || !d?.podeEditar} onClick={usar}>Usar no roteiro</Button>
        </div>
      </div>

      {ins && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <BlocoCard titulo="Objeções" itens={ins.objecoes} />
            <BlocoCard titulo="Dúvidas" itens={ins.duvidas} />
            <BlocoCard titulo="Desejos" itens={ins.desejos} />
          </div>
          <div className="grid gap-1.5">
            <p className="text-sm font-semibold">Sentimento geral</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              <div className="bg-accent" style={{ width: `${ins.sentimento.positivo}%` }} />
              <div className="bg-muted-foreground/40" style={{ width: `${ins.sentimento.neutro}%` }} />
              <div className="bg-primary" style={{ width: `${ins.sentimento.negativo}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Positivo {ins.sentimento.positivo}% · Neutro {ins.sentimento.neutro}% · Negativo {ins.sentimento.negativo}%</p>
          </div>
          {ins.sem_resposta.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-semibold">Perguntas que ninguém respondeu</p>
              <p className="mb-2 text-xs text-muted-foreground">Dúvidas com zero respostas, das mais curtidas para as menos.</p>
              <ul className="grid gap-1 text-sm">{ins.sem_resposta.map((s, i) => <li key={i}>“{s.texto}” <span className="text-xs text-muted-foreground">({s.likes} likes)</span></li>)}</ul>
            </div>
          )}
        </>
      )}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["todos", ...CATEGORIAS] as const).map((c) => (
            <button key={c} type="button" onClick={() => setFiltro(c)} className={cn("rounded-full border px-3 py-1 text-xs", filtro === c ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {c === "todos" ? `Todos (${d?.comentarios?.length ?? 0})` : `${CATEGORIA_LABEL[c]} (${contagem.get(c) ?? 0})`}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-56">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar comentário" className="pl-8" />
          </div>
        </div>
        <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1">
          {lista.map((c) => (
            <li key={c.id} className="rounded-md border p-2.5 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {c.autor && <span>@{c.autor}</span>}
                <span>{c.likes} likes</span>
                <span>{plural(c.respostas, "resposta", "respostas")}</span>
                {c.categoria && <Badge variant="outline">{CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}{c.subtipo ? ` · ${SUBTIPO_LABEL[c.subtipo as keyof typeof SUBTIPO_LABEL] ?? c.subtipo}` : ""}</Badge>}
                {c.fixado && <Badge variant="secondary"><Pin className="size-3" />Fixado</Badge>}
                {c.curtido_dono && <Badge variant="secondary"><Heart className="size-3" />Curtido pelo dono</Badge>}
              </div>
              <p>{c.texto}</p>
            </li>
          ))}
          {!lista.length && <li className="text-sm text-muted-foreground">Nenhum comentário nesse filtro.</li>}
        </ul>
      </div>

      <Dialog open={usarAberto} onOpenChange={setUsarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usar no roteiro</DialogTitle>
            <DialogDescription>O bloco "Contexto dos compradores" entra no próximo vídeo que você criar. Você pode editar esse bloco no job.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => { setUsarAberto(false); toast.success("Escolha o produto e toque em Usar."); navigate({ to: "/app/produtos" }); }}>Escolher produto</Button>
            <Button variant="outline" onClick={() => { setUsarAberto(false); toast.success("Toque em Novo vídeo próprio."); navigate({ to: "/app/videos" }); }}>Novo vídeo próprio</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlocoCard({ titulo, itens }: { titulo: string; itens: Bloco[] }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-semibold">{titulo} <span className="text-xs font-normal text-muted-foreground">({itens.reduce((s, i) => s + i.frequencia, 0)})</span></p>
      {itens.length ? (
        <ul className="grid gap-2">
          {itens.map((b, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">{b.tema} <span className="text-xs text-muted-foreground">{b.frequencia}x{b.subtipo ? ` · ${SUBTIPO_LABEL[b.subtipo as keyof typeof SUBTIPO_LABEL] ?? b.subtipo}` : ""}</span></p>
              {b.exemplo && <p className="text-xs text-muted-foreground">“{b.exemplo}”</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">Nada encontrado.</p>}
    </div>
  );
}

/** Botão "Ler comentários" para linhas/cards: abre o painel num modal. */
export function LerComentariosButton({ url, titulo, origem, size = "icon" }: { url: string; titulo?: string | null | undefined; origem?: string | undefined; size?: "icon" | "sm" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size={size} title="Ler comentários" aria-label="Ler comentários" onClick={(e) => { e.stopPropagation(); setAberto(true); }}>
        <MessageCircle className="size-4" />{size === "sm" && "Comentários"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Comentários</DialogTitle>
            <DialogDescription className="line-clamp-2">{titulo || url}</DialogDescription>
          </DialogHeader>
          {aberto && <ComentariosPanel url={url} titulo={titulo} origem={origem} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
