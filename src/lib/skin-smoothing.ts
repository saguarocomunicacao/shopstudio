/**
 * Suavização de pele (beta) por detecção facial no navegador.
 * A biblioteca do MediaPipe é carregada sob demanda (import dinâmico), então
 * ela não entra no carregamento inicial do app.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type SkinIntensity = "leve" | "medio" | "forte";

const INTENSIDADE: Record<SkinIntensity, { blur: number; alpha: number }> = {
  leve: { blur: 0.008, alpha: 0.4 },
  medio: { blur: 0.013, alpha: 0.6 },
  forte: { blur: 0.02, alpha: 0.78 },
};

type Landmark = { x: number; y: number };
type Connection = { start: number; end: number };

type Landmarker = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => { faceLandmarks: Landmark[][] };
  close: () => void;
};

let cached: Promise<{ landmarker: Landmarker; regions: { oval: number[]; holes: number[][] } }> | null = null;

/** Ordena os índices de uma lista de conexões em um contorno fechado. */
function contourOrder(connections: readonly Connection[]): number[] {
  const next = new Map<number, number>();
  for (const c of connections) next.set(c.start, c.end);
  const first = connections[0]?.start;
  if (first === undefined) return [];
  const order: number[] = [first];
  let current = first;
  for (let i = 0; i < next.size; i += 1) {
    const step = next.get(current);
    if (step === undefined || step === first) break;
    order.push(step);
    current = step;
  }
  return order;
}

export async function loadSkinSmoother() {
  if (!cached) {
    cached = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const landmarker = (await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      })) as unknown as Landmarker;
      const F = vision.FaceLandmarker;
      return {
        landmarker,
        regions: {
          oval: contourOrder(F.FACE_LANDMARKS_FACE_OVAL),
          holes: [
            contourOrder(F.FACE_LANDMARKS_LEFT_EYE),
            contourOrder(F.FACE_LANDMARKS_RIGHT_EYE),
            contourOrder(F.FACE_LANDMARKS_LEFT_EYEBROW),
            contourOrder(F.FACE_LANDMARKS_RIGHT_EYEBROW),
            contourOrder(F.FACE_LANDMARKS_LIPS),
          ].filter((c) => c.length > 2),
        },
      };
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

export type SkinSmoother = {
  /** Desenha o quadro já suavizado no contexto informado. Retorna false se não conseguiu detectar rosto. */
  render: (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    intensity: SkinIntensity,
    timestamp: number,
    filterCss: string,
  ) => boolean;
  close: () => void;
};

export async function createSkinSmoother(): Promise<SkinSmoother> {
  const { landmarker, regions } = await loadSkinSmoother();
  const blurCanvas = document.createElement("canvas");
  const blurCtx = blurCanvas.getContext("2d");
  let lastTs = -1;

  const tracePath = (target: CanvasRenderingContext2D, pts: Landmark[], idx: number[], w: number, h: number) => {
    target.beginPath();
    idx.forEach((i, position) => {
      const p = pts[i];
      if (!p) return;
      if (position === 0) target.moveTo(p.x * w, p.y * h);
      else target.lineTo(p.x * w, p.y * h);
    });
    target.closePath();
  };

  return {
    render(ctx, video, intensity, timestamp, filterCss) {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      if (!blurCtx || !w || !h) return false;
      const ts = timestamp <= lastTs ? lastTs + 1 : timestamp;
      lastTs = ts;
      let landmarks: Landmark[] | undefined;
      try {
        landmarks = landmarker.detectForVideo(video, ts)?.faceLandmarks?.[0];
      } catch {
        return false;
      }
      if (!landmarks?.length) return false;

      const { blur, alpha } = INTENSIDADE[intensity];
      if (blurCanvas.width !== w || blurCanvas.height !== h) {
        blurCanvas.width = w;
        blurCanvas.height = h;
      }
      blurCtx.filter = `blur(${Math.max(1, Math.round(blur * Math.min(w, h)))}px)`;
      blurCtx.drawImage(ctx.canvas, 0, 0, w, h);
      blurCtx.filter = "none";

      ctx.save();
      tracePath(ctx, landmarks, regions.oval, w, h);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.drawImage(blurCanvas, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.restore();

      // Repõe olhos, sobrancelhas e boca nítidos por cima da região suavizada.
      for (const hole of regions.holes) {
        ctx.save();
        tracePath(ctx, landmarks, hole, w, h);
        ctx.clip();
        ctx.filter = filterCss || "none";
        try {
          ctx.drawImage(video, 0, 0, w, h);
        } catch {
          // quadro indisponível
        }
        ctx.filter = "none";
        ctx.restore();
      }
      return true;
    },
    close() {
      try {
        landmarker.close();
      } catch {
        // ignora
      }
      cached = null;
    },
  };
}
