import type { Atom } from '../core/atom-class';

// What reading, writing and typing Typst ask alike of the atoms MathLive holds.

/** a branch's atoms, without the one MathLive starts every branch with */
export function children(atoms: readonly Atom[] | undefined): Atom[] {
  return (atoms ?? []).filter((atom) => atom.type !== 'first');
}

export function hasScripts(atom: Atom): boolean {
  return (
    children(atom.subscript).length > 0 || children(atom.superscript).length > 0
  );
}

/**
 * How many primes `'` an atom is written as: MathLive's `\doubleprime` is two. None for a
 * prime symbol, `x^prime`, which on `sum` sits elsewhere.
 */
export function primeCount(atom: Atom): number {
  const name = atom.typstSpelling?.name;
  if (name !== undefined && name !== "'") return 0;
  return /^′+$/.test(atom.value ?? '') ? atom.value!.length : 0;
}

export function isPrime(atom: Atom): boolean {
  return primeCount(atom) > 0;
}

export function isDigit(atom: Atom): boolean {
  return atom.type === 'mord' && /^\d$/.test(atom.value ?? '');
}

export function isDot(atom: Atom): boolean {
  return atom.type !== 'first' && atom.mode === 'math' && atom.value === '.';
}

/** the digits and points `atoms` spell, `12.5`, or undefined when they are anything else */
export function numberText(atoms: readonly Atom[]): string | undefined {
  if (!atoms.every((x) => isDigit(x) || isDot(x))) return undefined;
  return atoms.map((x) => x.value).join('');
}

/** atoms that write as one number, `12.5` */
export function isNumber(atoms: readonly Atom[]): boolean {
  return /^\d+(\.\d+)?$/.test(numberText(atoms) ?? '');
}
