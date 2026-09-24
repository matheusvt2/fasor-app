/*
 * AD-2: every count phrase the UI shows is derived in the kernel, once. A surface
 * never writes a singular-or-plural choice of its own.
 */

/** A pt-BR list: "A", "A e B", "A, B e D". */
export function listPtBr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** "1 ficha" / "3 fichas". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 relatório" / "3 relatórios". */
export function relatoriosCount(n: number): string {
  return plural(n, 'relatório', 'relatórios');
}

/** "1 pessoa da equipe" / "2 pessoas da equipe". */
export function peopleCount(n: number): string {
  return plural(n, 'pessoa da equipe', 'pessoas da equipe');
}
