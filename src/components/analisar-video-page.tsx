import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pencil } from "lucide-react";
import { shareOrDownloadVideo } from "@/lib/video-download";
import { Copy, Download, FileVideo2, Loader2, Play, RefreshCw, Trash2, Upload, ArrowLeft, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "./page-header";
import { ImageLightbox } from "./image-lightbox";
import { useAnaliseCustos, brl as custoBrl } from "@/lib/custo";
import { AlertTriangle } from "lucide-react";
import { useStudio } from "./studio-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { avancarAnalise, baixarVideoDaAnalise, criarAnalise, executarAnalise, type ResultadoAnalise } from "@/lib/video-analise.functions";
import { captureVideoThumbnail } from "@/lib/video-thumbnail";
import { userErrorMessage as friendlyError } from "@/lib/user-error";

type Analise = {
  id: string;
  tenant_id: string;
  profile_id: string;
  origem: "arquivo" | "youtube" | "tiktok" | "instagram";
  link_url: string | null;
  rede_meta: RedeMeta | null;
  storage_path: string | null;
  youtube_url: string | null;
  titulo: string;
  duracao: number | null;
  status: "na_fila" | "enviando" | "baixando" | "analisando" | "pronto" | "erro";
  erro: string | null;
  resultado: ResultadoAnalise | null;
  frames: { inicio: number; path: string }[];
  custo_cents: number;
  created_at: string;
  pergunta?: string | null;
  mime_type?: string | null;
  arquivo_nome?: string | null;
  arquivo_bytes?: number | null;
  etapa_log?: EtapaLog[] | null;
};

type EtapaLog = { etapa: string; em: string; tentativa?: number; motivo?: string; detalhe?: string; erro?: string; definitivo?: boolean };

type RedeMeta = { autor: string | null; views: number | null; likes: number | null; comentarios: number | null; compartilhamentos: number | null; salvos?: number | null; publicado_em: string | null };

const BUCKET = "video-analises";
const ORIGEM_LABEL: Record<Analise["origem"], string> = { arquivo: "Arquivo", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };
function redeDoLink(url: string): "youtube" | "tiktok" | "instagram" | null {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    if (h === "youtube.com" || h === "youtu.be") return "youtube";
    if (h.endsWith("tiktok.com")) return "tiktok";
    if (h === "instagram.com" && /^\/(reel|reels|p)\//.test(u.pathname)) return "instagram";
  } catch { /* link incompleto */ }
  return null;
}
function RedeIcon({ origem, className = "size-4" }: { origem: Analise["origem"]; className?: string }) {
  if (origem === "arquivo") return <FileVideo2 className={className} aria-label="Arquivo" />;
  const letra = origem === "youtube" ? "YT" : origem === "tiktok" ? "TT" : "IG";
  return <span aria-label={ORIGEM_LABEL[origem]} className="inline-grid size-5 place-items-center rounded bg-muted font-mono text-[9px] font-bold text-foreground">{letra}</span>;
}
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { notation: v >= 10000 ? "compact" : "standard" }));
const MAX = 200 * 1024 * 1024;
const TIPOS = ["video/mp4", "video/quicktime", "video/webm"];
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const tempo = (s: number | null | undefined) => {
  const v = Math.max(0, Math.round(Number(s ?? 0)));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};
const STATUS: Record<Analise["status"], [string, string]> = {
  na_fila: ["Na fila", "status-violet"],
  enviando: ["Enviando", "status-violet"],
  baixando: ["Baixando", "status-violet"],
  analisando: ["Analisando", "status-blue"],
  pronto: ["Pronto", "status-lime"],
  erro: ["Erro", "status-pink"],
};

function ytId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/);
  return m?.[1] ?? "";
}

async function assinar(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}

async function lerDuracao(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? v.duration : null);
      URL.revokeObjectURL(url);
    };
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

function useAnalises(profileId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!profileId) return undefined;
    const ch = supabase
      .channel(`analises-${profileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "video_analises", filter: `profile_id=eq.${profileId}` }, () =>
        qc.invalidateQueries({ queryKey: ["video-analises", profileId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profileId, qc]);
  return useQuery({
    queryKey: ["video-analises", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_analises")
        .select("*")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error("Não foi possível carregar as análises.");
      const rows = (data ?? []) as unknown as Analise[];
      const urls = await assinar(rows.flatMap((r) => (r.frames?.[0]?.path ? [r.frames[0].path] : [])));
      return rows.map((r) => ({ ...r, thumb: r.frames?.[0]?.path ? urls[r.frames[0].path] : undefined }));
    },
  });
}

export function AnalisarVideoPage() {
  const { activeProfileId, can, isBackoffice } = useStudio();
  const podeVerCusto = isBackoffice || can("custos", "visualizar", activeProfileId);
  const { data: custos } = useAnaliseCustos(podeVerCusto ? activeProfileId : null);
  const podeCriar = can("pipeline", "criar", activeProfileId) || can("pipeline", "editar", activeProfileId);
  const { data: analises = [], isLoading, error } = useAnalises(activeProfileId);
  const [novo, setNovo] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const executar = useServerFn(executarAnalise);
  const avancar = useServerFn(avancarAnalise);
  const qc = useQueryClient();
  const aberta = analises.find((a) => a.id === abertaId) ?? null;

  // Enquanto houver análise em andamento, a tela empurra as etapas (uma chamada por vez).
  const emAndamento = analises.filter((a) => a.status === "analisando").map((a) => a.id).join(",");
  useEffect(() => {
    if (!emAndamento) return undefined;
    let ocupado = false;
    const ids = emAndamento.split(",");
    const tick = async () => {
      if (ocupado) return;
      ocupado = true;
      try { for (const id of ids) await avancar({ data: { id } }).catch(() => null); }
      finally { ocupado = false; qc.invalidateQueries({ queryKey: ["video-analises", activeProfileId] }); }
    };
    void tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, [emAndamento, avancar, qc, activeProfileId]);

  const reanalisar = async (a: Analise) => {
    toast.message("Reanalisando o vídeo...");
    const r = await executar({ data: { id: a.id, reanalisar: true } }).catch((e) => ({ ok: false, erro: friendlyError(e) }));
    if (!r.ok) toast.error(("erro" in r && r.erro) || "Não foi possível analisar.");
    qc.invalidateQueries({ queryKey: ["video-analises", activeProfileId] });
  };
  const remover = async (a: Analise) => {
    if (!confirm("Remover esta análise?")) return;
    const paths = [a.storage_path, ...(a.frames ?? []).map((f) => f.path)].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error: e } = await supabase.from("video_analises").delete().eq("id", a.id);
    if (e) { toast.error("Não foi possível remover."); return; }
    if (abertaId === a.id) setAbertaId(null);
    qc.invalidateQueries({ queryKey: ["video-analises", activeProfileId] });
  };

  if (!activeProfileId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analisar vídeo" description="Selecione um perfil no topo para começar." />
      </div>
    );
  }

  if (aberta) return <DetalheAnalise a={aberta} onVoltar={() => setAbertaId(null)} onReanalisar={() => reanalisar(aberta)} podeEditar={podeCriar} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analisar vídeo"
        description="Envie um vídeo ou cole um link do TikTok, YouTube ou Instagram e veja gancho, cenas, fala e produto."
        actions={podeCriar ? <Button onClick={() => setNovo(true)}><Upload className="size-4" />Nova análise</Button> : null}
      />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</div>
        ) : error ? (
          <p className="p-8 text-sm text-muted-foreground">Não foi possível carregar as análises. Recarregue a página.</p>
        ) : !analises.length ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FileVideo2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma análise neste perfil ainda.</p>
            {podeCriar && <Button onClick={() => setNovo(true)}>Nova análise</Button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Vídeo</th><th className="p-3">Origem</th><th className="p-3">Duração</th>
                <th className="p-3">Data</th><th className="p-3">Status</th>{podeVerCusto && <th className="p-3">Custo</th>}<th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {analises.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="p-3">
                    <button className="flex items-center gap-3 text-left" onClick={() => setAbertaId(a.id)}>
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                        {a.thumb ? <img src={a.thumb} alt="" className="size-full object-cover" /> : a.origem === "youtube" && a.youtube_url && ytId(a.youtube_url) ? (
                          <img src={`https://i.ytimg.com/vi/${ytId(a.youtube_url)}/default.jpg`} alt="" className="size-full object-cover" />
                        ) : <ImageIcon className="size-4 text-muted-foreground" />}
                      </span>
                      <span className="line-clamp-2 font-medium">{a.titulo}</span>
                    </button>
                  </td>
                  <td className="p-3"><span className="inline-flex items-center gap-1.5"><RedeIcon origem={a.origem} />{ORIGEM_LABEL[a.origem]}</span></td>
                  <td className="p-3">{a.duracao ? tempo(a.duracao) : "—"}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[a.status][1]}`}>
                      {(a.status === "analisando" || a.status === "enviando" || a.status === "baixando") && <Loader2 className="size-3 animate-spin" />}
                      {a.status === "analisando" && (a as { etapa?: string | null }).etapa
                        ? ({ enviando: "Enviando à IA", processando_no_gemini: "IA processando", gerando: "Gerando análise" } as Record<string, string>)[(a as { etapa?: string | null }).etapa!] ?? STATUS[a.status][0]
                        : STATUS[a.status][0]}
                    </span>
                  </td>
                  {podeVerCusto && (
                    <td className="p-3 whitespace-nowrap">
                      {(() => {
                        const c = custos?.get(a.id);
                        return c && c.totalBrl > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground" title={c.etapas.map((e) => `${e.etapa === "apify_download" ? "Download" : "IA"}: ${custoBrl(e.valorBrl)}`).join(" · ")}>{custoBrl(c.totalBrl)}{(c.estimado || c.semTarifa) && <AlertTriangle className="size-3 text-muted-foreground" />}</span> : <span className="text-muted-foreground">—</span>;
                      })()}
                    </td>
                  )}
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setAbertaId(a.id)}>Abrir</Button>
                      {podeCriar && (
                        <>
                          <Button size="icon" variant="ghost" aria-label="Reanalisar" disabled={a.status === "analisando" || a.status === "enviando" || a.status === "baixando"} onClick={() => reanalisar(a)}><RefreshCw className="size-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(a)}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <NovaAnaliseDialog open={novo} onOpenChange={setNovo} profileId={activeProfileId} onCriada={(id) => setAbertaId(id)} />
    </div>
  );
}

function NovaAnaliseDialog({ open, onOpenChange, profileId, onCriada }: { open: boolean; onOpenChange: (v: boolean) => void; profileId: string; onCriada: (id: string) => void }) {
  const [aba, setAba] = useState<"arquivo" | "link">("arquivo");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const criar = useServerFn(criarAnalise);
  const executar = useServerFn(executarAnalise);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const rede = redeDoLink(url);
  const linkOk = !!rede;

  const escolher = (f: File | undefined) => {
    if (!f) return;
    if (!TIPOS.includes(f.type)) { toast.error("Envie um vídeo MP4, MOV ou WEBM."); return; }
    if (f.size > MAX) { toast.error("O vídeo passa de 200 MB."); return; }
    setFile(f);
  };

  const analisar = async () => {
    setEnviando(true);
    try {
      const duracao = aba === "arquivo" && file ? await lerDuracao(file) : null;
      const { id, storagePath } = await criar({
        data: {
          profileId,
          origem: aba,
          linkUrl: aba === "link" ? url.trim() : null,
          mimeType: file?.type ?? null,
          arquivoBytes: file?.size ?? null,
          titulo: aba === "arquivo" ? (file?.name ?? "") : "",
          duracao,
          pergunta: pergunta.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["video-analises", profileId] });
      if (aba === "arquivo" && file && storagePath) {
        const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: true });
        if (error) {
          await supabase.from("video_analises").update({ status: "erro", erro: "O envio do arquivo falhou. Tente de novo." }).eq("id", id);
          throw new Error("O envio do arquivo falhou. Tente de novo.");
        }
      }
      onOpenChange(false);
      setFile(null); setUrl(""); setPergunta("");
      onCriada(id);
      if (aba === "link") { toast.success("Baixando o vídeo. A análise começa assim que o download terminar."); return; }
      executar({ data: { id, reanalisar: false } })
        .then((r) => {
          if (r.ok) toast.success("Análise iniciada. Você pode acompanhar o progresso aqui.");
          else toast.error(("erro" in r && r.erro) || "Não foi possível analisar.");
        })
        .catch(() => toast.error("Não foi possível analisar o vídeo agora."))
        .finally(() => qc.invalidateQueries({ queryKey: ["video-analises", profileId] }));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setEnviando(false);
    }
  };

  const pronto = aba === "arquivo" ? !!file : linkOk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova análise</DialogTitle>
          <DialogDescription>Consome 1 unidade de "Análise de vídeo" (ilimitada quando seu plano não cobra).</DialogDescription>
        </DialogHeader>
        <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="arquivo">Enviar arquivo</TabsTrigger>
            <TabsTrigger value="link">Colar link</TabsTrigger>
          </TabsList>
          <TabsContent value="arquivo">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); escolher(e.dataTransfer.files[0]); }}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:border-muted-foreground"
            >
              <Upload className="size-6" />
              {file ? <span className="font-medium text-foreground">{file.name}</span> : "Arraste o vídeo ou clique para escolher"}
              <span className="text-xs">MP4, MOV ou WEBM até 200 MB</span>
            </button>
            <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          </TabsContent>
          <TabsContent value="link" className="space-y-2">
            <div className="flex items-center gap-2">
              <Input placeholder="Link do TikTok, YouTube ou Instagram" value={url} onChange={(e) => setUrl(e.target.value)} />
              {rede && <RedeIcon origem={rede} className="size-5" />}
            </div>
            {url.trim() && !rede ? <p className="text-xs text-primary">Ainda não suportado. Use um link do TikTok, YouTube ou Instagram (reel ou post).</p> : null}
            <div className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Custo estimado do download</p>
              {rede === "youtube" ? (
                <p>Cobrado pelo Apify por tamanho: cerca de US$ 0,006 por MB (um vídeo curto de 720p costuma ficar entre US$ 0,05 e US$ 0,30). O Apify reserva até US$ 0,50 por download; só o valor real é registrado.</p>
              ) : rede === "tiktok" ? (
                <p>Cobrado pelo Apify por vídeo baixado, normalmente poucos centavos de dólar. O valor real é registrado.</p>
              ) : rede === "instagram" ? (
                <p>Cobrado pelo Apify por MB baixado, normalmente poucos centavos de dólar por reel. O valor real é registrado.</p>
              ) : (
                <p>Depende da rede do link. O valor real do download é registrado.</p>
              )}
              <p className="mt-1">Mais a análise do vídeo, igual à de um arquivo enviado.</p>
            </div>
          </TabsContent>
        </Tabs>
        <div className="space-y-1">
          <label className="text-sm font-medium">O que você quer saber? <span className="text-muted-foreground">(opcional)</span></label>
          <Textarea rows={2} maxLength={1000} placeholder="Ex: foca no produto e no gancho" value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!pronto || enviando} onClick={analisar}>
            {enviando && <Loader2 className="size-4 animate-spin" />}Analisar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyBtn({ texto }: { texto: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(texto); toast.success("Copiado"); }}>
      <Copy className="size-3.5" />Copiar
    </Button>
  );
}

function Bloco({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">{titulo}</h3>
        <CopyBtn texto={texto} />
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  );
}

const ETAPA_NOME: Record<string, string> = {
  enviado: "Enviado", baixando: "Baixando da rede", baixado: "Vídeo baixado", enviando: "Enviando à IA",
  processando_no_gemini: "IA processando", gerando: "Gerando análise", pronto: "Pronto", erro: "Erro",
};
const bytesTxt = (b: number | null | undefined) =>
  b == null ? "—" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function OrigemBloco({ a, videoUrl, podeEditar, onReanalisar }: { a: Analise; videoUrl?: string | undefined; podeEditar: boolean; onReanalisar: () => void }) {
  const qc = useQueryClient();
  const link = a.link_url || a.youtube_url;
  const [editando, setEditando] = useState(false);
  const [pergunta, setPergunta] = useState(a.pergunta ?? "");
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const m = a.rede_meta;
  const log = (a.etapa_log ?? []).filter((l) => l && l.etapa);
  const ocupado = ["analisando", "enviando", "baixando"].includes(a.status);
  const nomeArquivo = a.arquivo_nome || `${a.titulo.replace(/[^\w\s.-]+/g, "").trim().slice(0, 60) || "video"}.${a.mime_type === "video/webm" ? "webm" : a.mime_type === "video/quicktime" ? "mov" : "mp4"}`;
  const engajamento = m?.views && m.views > 0
    ? (((m.likes ?? 0) + (m.comentarios ?? 0) + (m.compartilhamentos ?? 0) + (m.salvos ?? 0)) / m.views) * 100
    : null;

  const salvarPergunta = async () => {
    setSalvando(true);
    const { error } = await supabase.from("video_analises").update({ pergunta: pergunta.trim() || null }).eq("id", a.id);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar a pergunta."); return; }
    setEditando(false);
    await qc.invalidateQueries({ queryKey: ["video-analises", a.profile_id] });
    onReanalisar();
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <RedeIcon origem={a.origem} />
        {a.origem === "arquivo" ? "Arquivo enviado" : ORIGEM_LABEL[a.origem]}
        {m?.autor && <span className="font-normal text-muted-foreground">@{m.autor}</span>}
      </div>

      {a.origem !== "arquivo" && link && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Link original</p>
          <div className="flex gap-1">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" aria-label="Link original" />
            <Button size="icon" variant="outline" className="shrink-0" aria-label="Copiar link" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}><Copy className="size-4" /></Button>
            <Button size="icon" variant="outline" className="shrink-0" aria-label="Abrir link" asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a></Button>
          </div>
        </div>
      )}

      {(m?.publicado_em || m?.views != null || m?.likes != null || m?.salvos != null) && (
        <div className="grid grid-cols-3 gap-3">
          {([["Views", m?.views], ["Likes", m?.likes], ["Coment.", m?.comentarios], ["Compart.", m?.compartilhamentos], ...(m?.salvos != null ? [["Salvos", m.salvos] as const] : [])] as const).map(([l, v]) => (
            <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="font-display font-semibold">{num(v)}</p></div>
          ))}
          <div><p className="text-xs text-muted-foreground">Engajamento</p><p className="font-display font-semibold">{engajamento == null ? "—" : `${engajamento.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`}</p></div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">Publicado</p><p className="font-display font-semibold">{m?.publicado_em && !Number.isNaN(Date.parse(m.publicado_em)) ? new Date(m.publicado_em).toLocaleDateString("pt-BR") : "—"}</p></div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Arquivo</p>
        {a.storage_path ? (
          <>
            <p className="line-clamp-2 break-all font-medium">{nomeArquivo}</p>
            <p className="text-muted-foreground">{bytesTxt(a.arquivo_bytes)} · {a.duracao ? tempo(a.duracao) : "duração —"}</p>
            <Button
              variant="outline" size="sm" disabled={!videoUrl || baixando}
              onClick={async () => {
                if (!videoUrl) return;
                setBaixando(true);
                try { await shareOrDownloadVideo(videoUrl, nomeArquivo, a.titulo); }
                catch { toast.error("Não foi possível baixar o vídeo."); }
                finally { setBaixando(false); }
              }}
            >
              {baixando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Baixar vídeo
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">{a.status === "baixando" ? "Ainda baixando da rede." : "Nenhum vídeo salvo."}{a.duracao ? ` Duração: ${tempo(a.duracao)}.` : ""}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">O que você quis saber</p>
        {editando ? (
          <>
            <Textarea rows={3} maxLength={1000} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex: foca no produto e no gancho" />
            <div className="flex gap-2">
              <Button size="sm" disabled={salvando} onClick={salvarPergunta}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar e reanalisar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setPergunta(a.pergunta ?? ""); }}>Cancelar</Button>
            </div>
          </>
        ) : (
          <>
            <p className={a.pergunta ? "whitespace-pre-line" : "text-muted-foreground"}>{a.pergunta || "Nada preenchido."}</p>
            {podeEditar && <Button size="sm" variant="ghost" className="-ml-2" disabled={ocupado} onClick={() => setEditando(true)}><Pencil className="size-4" />Editar e reanalisar</Button>}
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Etapas</p>
        {log.length ? (
          <ol className="space-y-1.5">
            {log.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{new Date(l.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                <span className="min-w-0">
                  <span className={l.etapa === "erro" ? "font-medium text-destructive" : "font-medium"}>{ETAPA_NOME[l.etapa] ?? l.etapa}{l.tentativa && l.tentativa > 1 ? ` (tentativa ${l.tentativa})` : ""}</span>
                  {(l.motivo || l.erro) && <span className="block text-muted-foreground">{l.motivo || l.erro}</span>}
                  {l.detalhe && l.detalhe !== l.motivo && <span className="block break-words font-mono text-xs text-muted-foreground">{l.detalhe}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">Criada em {new Date(a.created_at).toLocaleString("pt-BR")}.{a.status === "erro" && a.erro ? ` Erro: ${a.erro}` : ""}</p>
        )}
      </div>
    </section>
  );
}

function AcoesErro({ a, onReanalisar }: { a: Analise; onReanalisar: () => void }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const ultimoErro = [...(a.etapa_log ?? [])].reverse().find((l) => l?.etapa === "erro");
  const definitivo = a.origem !== "arquivo" && !a.storage_path && !!ultimoErro?.definitivo;
  const enviar = async (file: File) => {
    if (!TIPOS.includes(file.type)) { toast.error("Use um vídeo MP4, MOV ou WEBM."); return; }
    if (file.size > MAX) { toast.error("O vídeo passa de 200 MB."); return; }
    setEnviando(true);
    try {
      const path = `${a.tenant_id}/${a.profile_id}/${a.id}/video`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw new Error("O envio do arquivo falhou. Tente de novo.");
      const duracao = await lerDuracao(file);
      const { error: e2 } = await supabase.from("video_analises").update({
        storage_path: path, mime_type: file.type, arquivo_nome: file.name, arquivo_bytes: file.size,
        duracao: duracao ?? a.duracao, frames: [],
        etapa_log: [...(a.etapa_log ?? []), { etapa: "enviado", em: new Date().toISOString() }],
      } as never).eq("id", a.id);
      if (e2) throw new Error("Não foi possível salvar o arquivo na análise.");
      await qc.invalidateQueries({ queryKey: ["video-analises", a.profile_id] });
      onReanalisar();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(f); }} />
      {definitivo ? (
        <Button disabled={enviando} onClick={() => inputRef.current?.click()}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Enviar arquivo</Button>
      ) : (
        <Button onClick={onReanalisar}><RefreshCw className="size-4" />Tentar novamente</Button>
      )}
    </div>
  );
}

function DetalheAnalise({ a, onVoltar, onReanalisar, podeEditar }: { a: Analise; onVoltar: () => void; onReanalisar: () => void; podeEditar: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ytStart, setYtStart] = useState(0);
  const baixarVideo = useServerFn(baixarVideoDaAnalise);
  const [baixandoVideo, setBaixandoVideo] = useState(false);
  const porUrl = !a.storage_path && !!a.youtube_url;
  const r = a.resultado;
  const qc = useQueryClient();

  const { data: urls = {} } = useQuery({
    queryKey: ["video-analise-urls", a.id, a.frames?.length ?? 0],
    queryFn: () => assinar([...(a.storage_path ? [a.storage_path] : []), ...(a.frames ?? []).map((f) => f.path)]),
    staleTime: 30 * 60 * 1000,
  });
  const videoUrl = a.storage_path ? urls[a.storage_path] : undefined;

  // Extrai um frame por cena no navegador (uma vez).
  const extraindo = useRef(false);
  useEffect(() => {
    if (!podeEditar || !a.storage_path || a.status !== "pronto" || !r?.cenas?.length || (a.frames ?? []).length || !videoUrl || extraindo.current) return undefined;
    extraindo.current = true;
    (async () => {
      const frames: { inicio: number; path: string }[] = [];
      for (const [i, c] of r.cenas.slice(0, 40).entries()) {
        try {
          const blob = await captureVideoThumbnail(videoUrl, Math.max(0.05, c.inicio + 0.1), 320);
          const path = `${a.tenant_id}/${a.profile_id}/${a.id}/frame-${i}.jpg`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (!error) frames.push({ inicio: c.inicio, path });
        } catch (e) {
          console.warn("[analise] frame", e);
        }
      }
      if (frames.length) {
        await supabase.from("video_analises").update({ frames }).eq("id", a.id);
        qc.invalidateQueries({ queryKey: ["video-analises", a.profile_id] });
      }
    })();
    return undefined;
  }, [a, r, videoUrl, podeEditar, qc]);

  const pular = (s: number) => {
    if (porUrl) setYtStart(Math.floor(s));
    else if (videoRef.current) { videoRef.current.currentTime = s; videoRef.current.play().catch(() => {}); }
  };
  const frameDe = (inicio: number) => {
    const f = (a.frames ?? []).find((x) => Math.abs(x.inicio - inicio) < 0.01);
    return f ? urls[f.path] : undefined;
  };
  const [lightbox, setLightbox] = useState<number | null>(null);
  const lightboxItems = (r?.cenas ?? []).flatMap((c, i) => {
    const src = frameDe(c.inicio);
    return src ? [{ src, cena: i, inicio: c.inicio, title: `Cena ${i + 1} · ${tempo(c.inicio)} até ${tempo(c.fim)}`, caption: c.descricao_visual, fileName: `cena-${i + 1}.jpg` }] : [];
  });
  const baixar = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `analise-${a.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const Tempo = ({ s }: { s: number }) => (
    <button className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:text-primary" onClick={() => pular(s)}>
      <Play className="size-3" />{tempo(s)}
    </button>
  );

  const transcricaoTxt = useMemo(() => (r?.transcricao ?? []).map((t) => `[${tempo(t.inicio)}] ${t.texto}`).join("\n"), [r]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="line-clamp-2 whitespace-normal" title={a.titulo}>{a.titulo}</span>}
        titleClassName="whitespace-normal"
        description={`${ORIGEM_LABEL[a.origem]} · ${new Date(a.created_at).toLocaleString("pt-BR")}${a.duracao ? ` · ${tempo(a.duracao)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onVoltar}><ArrowLeft className="size-4" />Voltar</Button>
            {r && <Button variant="outline" onClick={baixar}><Download className="size-4" />Baixar JSON</Button>}
            {porUrl && podeEditar && a.status === "pronto" && (
              <Button
                variant="outline"
                disabled={baixandoVideo}
                onClick={async () => {
                  setBaixandoVideo(true);
                  try {
                    await baixarVideo({ data: { id: a.id } });
                    toast.success("Baixando o vídeo. Os frames aparecem quando terminar.");
                  } catch (e) {
                    toast.error(friendlyError(e));
                  } finally {
                    setBaixandoVideo(false);
                  }
                }}
              >
                {baixandoVideo ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}Baixar e extrair frames
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border bg-overlay">
            {porUrl && a.youtube_url ? (
              <iframe
                key={ytStart}
                className="aspect-video w-full"
                src={`https://www.youtube.com/embed/${ytId(a.youtube_url)}?start=${ytStart}${ytStart ? "&autoplay=1" : ""}`}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={a.titulo}
              />
            ) : videoUrl ? (
              <video ref={videoRef} src={videoUrl} controls playsInline className="max-h-[70vh] w-full" />
            ) : (
              <div className="grid aspect-[9/16] max-h-[60vh] w-full place-items-center p-4 text-center text-sm text-muted-foreground">
                {a.storage_path ? "Carregando vídeo..." : a.status === "erro" ? "O vídeo não foi baixado." : a.status === "baixando" ? "Baixando o vídeo..." : "Sem vídeo salvo."}
              </div>
            )}
          </div>
          <OrigemBloco a={a} videoUrl={videoUrl ?? undefined} podeEditar={podeEditar} onReanalisar={onReanalisar} />
        </div>
        <div>
          {a.status === "erro" ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm">
              <p className="mb-1 font-medium">{a.erro ?? "Não foi possível analisar o vídeo."}</p>
              <p className="mb-3 text-muted-foreground">Os detalhes da origem e o motivo registrado estão ao lado, em "Etapas".</p>
              {podeEditar && <AcoesErro a={a} onReanalisar={onReanalisar} />}
            </div>
          ) : a.status !== "pronto" || !r ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {a.status === "enviando" ? "Enviando o vídeo..." : a.status === "baixando" ? "Baixando o vídeo do link. Leva de alguns segundos a poucos minutos; você pode sair e voltar." : "Analisando o vídeo. Isso pode levar um ou dois minutos; você pode sair e voltar."}
            </div>
          ) : (
            <Tabs defaultValue="resumo">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="cenas">Cenas ({r.cenas.length})</TabsTrigger>
                <TabsTrigger value="transcricao">Transcrição</TabsTrigger>
                <TabsTrigger value="gancho">Gancho e CTA</TabsTrigger>
                <TabsTrigger value="produto">Produto</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo" className="space-y-4">
                <Bloco titulo="Resumo" texto={r.resumo}><p className="whitespace-pre-line">{r.resumo}</p></Bloco>
                <Bloco titulo="Estilo" texto={`Formato: ${r.formato}\nTom de voz: ${r.tom_de_voz}\nRitmo: ${r.ritmo.cortes_por_minuto} cortes/min. ${r.ritmo.descricao}`}>
                  <p><span className="text-muted-foreground">Formato:</span> {r.formato}</p>
                  <p><span className="text-muted-foreground">Tom de voz:</span> {r.tom_de_voz}</p>
                  <p><span className="text-muted-foreground">Ritmo:</span> ~{r.ritmo.cortes_por_minuto} cortes/min. {r.ritmo.descricao}</p>
                </Bloco>
                <Bloco titulo="Hashtags sugeridas" texto={r.hashtags_sugeridas.join(" ")}>
                  <div className="flex flex-wrap gap-1.5">{r.hashtags_sugeridas.map((h) => <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-xs">{h.startsWith("#") ? h : `#${h}`}</span>)}</div>
                </Bloco>
              </TabsContent>
              <TabsContent value="cenas" className="space-y-3">
                {r.cenas.map((c, i) => {
                  const img = frameDe(c.inicio);
                  const li = lightboxItems.findIndex((x) => x.cena === i);
                  return (
                    <div key={i} className="flex gap-3 rounded-lg border border-border bg-card p-3">
                      {!!a.storage_path && (
                        img ? (
                          <button type="button" onClick={() => setLightbox(li)} aria-label={`Ampliar frame da cena ${i + 1}`} className="grid max-h-[160px] max-w-[160px] shrink-0 place-items-center self-start overflow-hidden rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <img src={img} alt={`Frame da cena ${i + 1}`} className="h-auto max-h-[160px] w-auto max-w-[160px] object-contain transition-opacity hover:opacity-90" />
                          </button>
                        ) : (
                          <div className="grid aspect-video w-[160px] shrink-0 place-items-center self-start rounded-md bg-muted"><ImageIcon className="size-4 text-muted-foreground" /></div>
                        )
                      )}
                      <div className="min-w-0 flex-1 space-y-1 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-medium">Cena {i + 1} <Tempo s={c.inicio} /><span className="text-xs text-muted-foreground">até {tempo(c.fim)}</span></span>
                          <CopyBtn texto={`${c.descricao_visual}\nTexto na tela: ${c.texto_na_tela}\nProduto: ${c.produto_visivel}`} />
                        </div>
                        <p>{c.descricao_visual}</p>
                        {c.texto_na_tela && <p><span className="text-muted-foreground">Texto na tela:</span> {c.texto_na_tela}</p>}
                        {c.pessoa_ou_mao && <p><span className="text-muted-foreground">Pessoa/mão:</span> {c.pessoa_ou_mao}</p>}
                        {c.produto_visivel && <p><span className="text-muted-foreground">Produto:</span> {c.produto_visivel}</p>}
                      </div>
                    </div>
                  );
                })}
                <ImageLightbox
                  items={lightboxItems}
                  index={lightbox}
                  onIndexChange={setLightbox}
                  actions={(_, i) => (
                    <Button type="button" size="sm" onClick={() => {
                      const it = lightboxItems[i];
                      setLightbox(null);
                      if (!it) return;
                      pular(it.inicio);
                      setTimeout(() => videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
                    }}><Play />Ir para este momento</Button>
                  )}
                />
              </TabsContent>
              <TabsContent value="transcricao">
                <Bloco titulo="Transcrição" texto={transcricaoTxt}>
                  {r.transcricao.length ? r.transcricao.map((t, i) => (
                    <p key={i} className="flex gap-2"><Tempo s={t.inicio} /><span>{t.texto}</span></p>
                  )) : <p className="text-muted-foreground">Sem fala no vídeo.</p>}
                </Bloco>
              </TabsContent>
              <TabsContent value="gancho" className="space-y-4">
                <Bloco titulo="Gancho (primeiros 3s)" texto={`${r.gancho.texto}\n\n${r.gancho.por_que_funciona}`}>
                  <p className="font-medium">"{r.gancho.texto}"</p>
                  <p className="text-muted-foreground">{r.gancho.por_que_funciona}</p>
                </Bloco>
                <Bloco titulo="CTA" texto={r.cta.texto}>
                  <p className="flex items-center gap-2"><Tempo s={r.cta.momento} />{r.cta.texto || "Sem CTA identificado."}</p>
                </Bloco>
              </TabsContent>
              <TabsContent value="produto">
                <Bloco titulo="Produto" texto={`${r.produto.nome}\n${r.produto.categoria}\n${r.produto.como_e_mostrado}`}>
                  <p><span className="text-muted-foreground">Nome provável:</span> {r.produto.nome || "Não identificado"}</p>
                  <p><span className="text-muted-foreground">Categoria:</span> {r.produto.categoria || "Não informada"}</p>
                  <p><span className="text-muted-foreground">Como é mostrado:</span> {r.produto.como_e_mostrado}</p>
                </Bloco>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
