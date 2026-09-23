/**
 * Download único e padronizado do arquivo de vídeo em todo o app.
 * Busca o arquivo e salva via blob para o navegador baixar de verdade
 * (o atributo `download` sozinho é ignorado em URLs assinadas de outro domínio).
 */

const slug = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

/** Extensão real do arquivo a partir da URL/blob; MP4 é o padrão. */
export function videoExtension(source: string | Blob | null | undefined): string {
  if (!source) return "mp4";
  if (typeof source !== "string") return source.type.includes("webm") ? "webm" : "mp4";
  const path = source.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".webm") ? "webm" : "mp4";
}

/** Nome amigável: título do vídeo + perfil. */
export function videoFileName(
  title: string | null | undefined,
  profileName?: string | null,
  ext = "mp4",
): string {
  const base = [slug(title) || "video", slug(profileName)].filter(Boolean).join("-").slice(0, 80);
  return `${base}.${ext}`;
}

/** Baixa o arquivo para o dispositivo. Em caso de bloqueio, abre para o usuário salvar. */
export async function downloadVideo(source: string | Blob, filename: string): Promise<void> {
  let blob: Blob | null = typeof source === "string" ? null : source;

  if (typeof source === "string") {
    try {
      const res = await fetch(source);
      if (res.ok) blob = await res.blob();
    } catch {
      blob = null;
    }
  }

  if (!blob) {
    if (typeof source === "string") window.open(source, "_blank", "noopener");
    else throw new Error("Não foi possível preparar o arquivo para download.");
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Busca o arquivo como blob (ou devolve o blob recebido). */
async function asBlob(source: string | Blob): Promise<Blob | null> {
  if (typeof source !== "string") return source;
  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * No celular abre a folha nativa de compartilhamento com o arquivo MP4
 * (WhatsApp, Arquivos/Fotos, AirDrop). Sem suporte, baixa o arquivo direto.
 */
export async function shareOrDownloadVideo(
  source: string | Blob,
  filename: string,
  title?: string,
): Promise<"shared" | "downloaded"> {
  const blob = await asBlob(source);
  if (blob) {
    const type = blob.type && blob.type.startsWith("video/")
      ? blob.type
      : filename.endsWith(".webm")
        ? "video/webm"
        : "video/mp4";
    const file = new File([blob], filename, { type });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: title || filename });
        return "shared";
      } catch (e) {
        // Cancelar a folha nativa não é erro; não cai para download nesse caso.
        if (e instanceof DOMException && e.name === "AbortError") return "shared";
      }
    }
  }
  await downloadVideo(blob ?? source, filename);
  return "downloaded";
}
