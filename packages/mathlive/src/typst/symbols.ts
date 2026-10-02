import {
  TYPST_DEPRECATED,
  TYPST_MATH_SHORTHANDS,
  TYPST_SYMBOLS,
  type TypstSymbolEntry,
} from './symbol-data';

/** what Typst reads a name such as `arrow.r.long` or `keyboard.tab` as, undefined if no symbol */
export function typstSymbolValue(name: string): string | undefined {
  const parts = name.split('.');
  for (let i = parts.length; i > 0; i--) {
    const entry = TYPST_SYMBOLS[parts.slice(0, i).join('.')];
    if (entry !== undefined) return resolveVariant(entry, parts.slice(i));
  }
  return undefined;
}

// codex's ModifierSet::best_match_in: of the variants holding every modifier asked for, the one
// with the fewest others, declaration order breaking ties
function resolveVariant(
  entry: TypstSymbolEntry,
  modifiers: readonly string[]
): string | undefined {
  if (typeof entry === 'string')
    return modifiers.length === 0 ? entry : undefined;
  let best: string | undefined;
  let fewest = Infinity;
  for (const [mods, value] of entry) {
    const set = mods ? mods.split('.') : [];
    if (!modifiers.every((m) => set.includes(m))) continue;
    if (set.length < fewest) [best, fewest] = [value, set.length];
  }
  return best;
}

/** a symbol's character without the selector asking for its text or emoji form */
export function withoutPresentation(value: string): string {
  return value.replace(/[\ufe0e\ufe0f]/g, '');
}

/** a name Typst still reads but warns about, itself or the module or symbol it is in */
export function isDeprecatedName(name: string): boolean {
  const parts = name.split('.');
  return parts.some((_, i) =>
    TYPST_DEPRECATED.has(parts.slice(0, i + 1).join('.'))
  );
}

export function typstShorthandValue(text: string): string | undefined {
  return TYPST_MATH_SHORTHANDS[text];
}

let names: Map<string, string> | undefined;

/**
 * How to write a character Typst has a name for: a shorthand when there is one (`->`, `<=`),
 * else the shortest name that reads back as it.
 */
export function typstSymbolName(value: string): string | undefined {
  if (!names) {
    names = new Map();
    for (const [text, char] of Object.entries(TYPST_MATH_SHORTHANDS))
      if (!names.has(char)) names.set(char, text);
    const named = new Map<string, string>();
    for (const [base, entry] of Object.entries(TYPST_SYMBOLS)) {
      const variants = typeof entry === 'string' ? [['', entry]] : entry;
      for (const [mods, char] of variants) {
        const full = mods ? `${base}.${mods}` : base;
        if (isDeprecatedName(full)) continue;
        const name = typstSymbolValue(base) === char ? base : full;
        const known = named.get(char);
        if (known === undefined || name.length < known.length)
          named.set(char, name);
      }
    }
    for (const [char, name] of named)
      if (!names.has(char)) names.set(char, name);
  }
  return names.get(value) ?? names.get(`${value}\ufe0e`);
}

// typst-library's math/accent.rs ACCENTS: the characters a symbol must stand for to be callable
// as an accent, keyed by the combining mark it puts on
const ACCENTS: readonly (readonly [string, readonly string[]])[] = [
  ['\u0300', ['`']],
  ['\u0301', ['´']],
  ['\u0302', ['^', 'ˆ']],
  ['\u0303', ['~', '∼', '˜']],
  ['\u0304', ['¯']],
  ['\u0305', ['-', '–', '‾', '−']],
  ['\u0306', ['˘']],
  ['\u0307', ['.', '˙', '⋅']],
  ['\u0308', ['¨']],
  ['\u20db', []],
  ['\u20dc', []],
  ['\u030a', ['∘', '○']],
  ['\u030b', ['˝']],
  ['\u030c', ['ˇ']],
  ['\u20d6', ['←']],
  ['\u20d7', ['→', '⟶']],
  ['\u20e1', ['↔', '↔\ufe0e', '⟷']],
  ['\u20d0', ['↼']],
  ['\u20d1', ['⇀']],
];

// MathLive's commands for those marks; a mark missing here stays a plain call
const ACCENT_COMMANDS: Readonly<Record<string, string>> = {
  '\u0300': '\\grave',
  '\u0301': '\\acute',
  '\u0302': '\\hat',
  '\u0303': '\\tilde',
  '\u0304': '\\bar',
  '\u0305': '\\bar',
  '\u0306': '\\breve',
  '\u0307': '\\dot',
  '\u0308': '\\ddot',
  '\u20db': '\\dddot',
  '\u20dc': '\\ddddot',
  '\u030a': '\\mathring',
  '\u030c': '\\check',
  '\u20d6': '\\overleftarrow',
  '\u20d7': '\\vec',
  '\u20e1': '\\overleftrightarrow',
  '\u20d0': '\\overleftharpoon',
  '\u20d1': '\\overrightharpoon',
};

/** the MathLive accent command calling a symbol with this value puts on its argument */
export function typstAccentCommand(value: string): string | undefined {
  const accent = ACCENTS.find(
    ([mark, alternatives]) => mark === value || alternatives.includes(value)
  );
  return accent ? ACCENT_COMMANDS[accent[0]] : undefined;
}

/** the Typst name to write a MathLive accent command back as */
export const TYPST_ACCENT_NAMES: Readonly<Record<string, string>> = {
  '\\grave': 'grave',
  '\\acute': 'acute',
  '\\hat': 'hat',
  '\\widehat': 'hat',
  '\\tilde': 'tilde',
  '\\widetilde': 'tilde',
  '\\bar': 'macron',
  '\\breve': 'breve',
  '\\dot': 'dot',
  '\\ddot': 'dot.double',
  '\\dddot': 'dot.triple',
  '\\ddddot': 'dot.quad',
  '\\mathring': 'circle',
  '\\check': 'caron',
  '\\widecheck': 'caron',
  '\\vec': 'arrow',
  '\\overrightarrow': 'arrow',
  '\\overleftarrow': 'arrow.l',
  '\\overleftrightarrow': 'arrow.l.r',
  '\\overleftharpoon': 'harpoon.lt',
  '\\overrightharpoon': 'harpoon',
};
