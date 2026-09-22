/** Extrai um frame do vídeo no navegador sem reencodar o arquivo original. */
export async function captureVideoThumbnail(source: Blob | string, seekSeconds = 1): Promise<Blob> {
  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  if (typeof source === "string") video.crossOrigin = "anonymous";
  video.src = objectUrl ?? (typeof source === "string" ? source : "");

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Não foi possível abrir o vídeo para gerar a miniatura.")), { once: true });
      video.load();
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0 ? Math.min(Math.max(0.05, seekSeconds), Math.max(0.05, duration / 2)) : 0.05;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || Math.abs(video.currentTime - target) > 0.02) {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("Não foi possível localizar um frame do vídeo.")), { once: true });
        video.currentTime = target;
      });
    }

    if (!video.videoWidth || !video.videoHeight) throw new Error("O vídeo não informou dimensões válidas.");
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a miniatura.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível criar a miniatura."))),
        "image/jpeg",
        0.82,
      );
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}