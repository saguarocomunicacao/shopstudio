/** "1 comentário lido" / "2 comentários lidos". */
export function plural(n: number | null | undefined, um: string, varios: string, fmt?: (n: number) => string) {
  const v = Number(n ?? 0);
  return `${fmt ? fmt(v) : v.toLocaleString("pt-BR")} ${v === 1 ? um : varios}`;
}
