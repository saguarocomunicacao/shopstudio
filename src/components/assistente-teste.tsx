import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { perguntarAssistente } from "@/lib/assistente.functions";
import { useStudio } from "@/components/studio-context";

type Msg = { role: "user" | "assistant"; content: string; ferramentas?: string[] };

export function AssistenteTeste() {
  const { activeProfileId } = useStudio();
  const rota = useRouterState({ select: (s) => s.location.pathname });
  const perguntar = useServerFn(perguntarAssistente);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    const t = texto.trim();
    if (!t || carregando) return;
    const nova = [...msgs, { role: "user" as const, content: t }];
    setMsgs(nova);
    setTexto("");
    setErro(null);
    setCarregando(true);
    try {
      const r = await perguntar({
        data: {
          messages: nova.map(({ role, content }) => ({ role, content })),
          profileId: activeProfileId && activeProfileId !== "all" ? activeProfileId : null,
          rota,
        },
      });
      if (r.ok) setMsgs([...nova, { role: "assistant", content: r.texto, ferramentas: r.ferramentas }]);
      else setErro(r.erro);
    } catch {
      setErro("O assistente não conseguiu responder agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">Assistente (teste)</h2>
          <p className="mt-1 text-sm text-muted-foreground">Só consulta. Responde com os dados do perfil selecionado no topo e com o que o seu usuário pode ver.</p>
        </div>
        {msgs.length > 0 && <Button variant="outline" size="sm" onClick={() => { setMsgs([]); setErro(null); }}>Nova conversa</Button>}
      </div>
      <div className="mt-4 grid gap-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[95%] text-sm"}>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.ferramentas && m.ferramentas.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Consultas: {m.ferramentas.join(", ")}</p>
            )}
          </div>
        ))}
        {carregando && <p className="text-sm text-muted-foreground">Consultando...</p>}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </div>
      <div className="mt-4 grid gap-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: Como está meu pipeline?"
          rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
        />
        <div className="flex justify-end"><Button onClick={() => void enviar()} disabled={carregando || !texto.trim()}>Enviar</Button></div>
      </div>
    </section>
  );
}
