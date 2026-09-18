/**
 * Radar de emergentes: destaca produtos que estão COMEÇANDO a subir.
 * Ao contrário do hype score (que premia volume já consolidado), aqui o
 * crescimento manda e o volume/receita já altos PENALIZAM o produto.
 */

export type RadarInput = {
  growthRate: number;
  salesVolume: number;
  revenue: number;
  /** true quando o filtro de lançamento recente está ativo na busca. */
  recentLaunch?: boolean;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const logNorm = (value: number, max: number) =>
  clamp01(Math.log10(Math.max(0, value) + 1) / Math.log10(max + 1));

/**
 * Score de ascensão (0-100):
 *  - crescimento (peso 1,0): 0% -> 0, 300% ou mais -> 1;
 *  - penalidade de saturação: vendas (até 20 mil) e receita (até R$ 500 mil)
 *    reduzem o score em até 55%;
 *  - bônus de +8 pontos para lançamentos recentes.
 */
export function ascensionScore({ growthRate, salesVolume, revenue, recentLaunch }: RadarInput): number {
  const growth = clamp01(growthRate / 300);
  const saturacao = 0.6 * logNorm(salesVolume, 20_000) + 0.4 * logNorm(revenue, 500_000);
  const base = growth * (1 - 0.55 * saturacao);
  const bonus = recentLaunch ? 0.08 : 0;
  return Math.round(clamp01(base + bonus) * 100);
}

/** Top scores ganham o selo "Em ascensão". */
export const RISING_BADGE_THRESHOLD = 55;
