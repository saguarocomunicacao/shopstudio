/** Lê a duração (segundos) de um vídeo no navegador. Null se não conseguir. */
export function videoDuration(src: Blob | string, timeoutMs = 10000): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let done = false;
    const end = (d: number | null) => {
      if (done) return;
      done = true;
      if (typeof src !== "string") URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(d);
    };
    const t = setTimeout(() => end(null), timeoutMs);
    v.onloadedmetadata = () => {
      // Blobs do MediaRecorder podem vir com Infinity: força o cálculo buscando o fim.
      if (v.duration === Infinity) {
        v.ontimeupdate = () => { v.ontimeupdate = null; clearTimeout(t); end(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null); };
        v.currentTime = 1e9;
        return;
      }
      clearTimeout(t);
      end(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 10) / 10 : null);
    };
    v.onerror = () => { clearTimeout(t); end(null); };
    v.src = url;
  });
}
