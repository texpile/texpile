import type { PrivateStyle } from '../core/types';
import type { Variant, VariantStyle } from '../public/core-types';

// Typst styles math along three independent axes: a font family, bold, and italic (forced on,
// forced off, or left to the letter). MathLive folds the same three into a variant and a
// variant style, the way \mathbf, \boldsymbol, \mathrm and \mathit do.
type TypstStyle = { family?: string; bold: boolean; italic?: boolean };

const FAMILY_VARIANTS: Readonly<Record<string, Variant>> = {
  bb: 'double-struck',
  cal: 'calligraphic',
  scr: 'script',
  frak: 'fraktur',
  sans: 'sans-serif',
  mono: 'monospace',
};

export const TYPST_STYLE_CALLS: ReadonlySet<string> = new Set([
  ...Object.keys(FAMILY_VARIANTS),
  'serif',
  'bold',
  'upright',
  'italic',
]);

function decompose(style: PrivateStyle): TypstStyle {
  const family = Object.keys(FAMILY_VARIANTS).find(
    (name) => FAMILY_VARIANTS[name] === style.variant
  );
  const variantStyle = style.variantStyle;
  const bold = variantStyle === 'bold' || variantStyle === 'bolditalic';
  // MathLive's `normal` variant is the default letter shape, upright only made explicit
  // (\mathrm is `up`, \mathbf is `bold` on `normal`); `main` is upright and `math` italic
  let italic: boolean | undefined;
  if (variantStyle === 'italic' || variantStyle === 'bolditalic') italic = true;
  else if (variantStyle === 'up') italic = false;
  else if (style.variant === 'normal' && variantStyle === 'bold')
    italic = false;
  else if (style.variant === 'main') italic = false;
  else if (style.variant === 'math') italic = true;
  return { family, bold, italic };
}

function compose(base: PrivateStyle, typst: TypstStyle): PrivateStyle {
  const { family, bold, italic } = typst;
  let variant: Variant | undefined;
  if (family) variant = FAMILY_VARIANTS[family];
  else if (italic === false) variant = 'normal';
  else if (italic === true) variant = 'main';
  let variantStyle: VariantStyle | undefined;
  if (bold) variantStyle = italic === true ? 'bolditalic' : 'bold';
  else if (italic === true) variantStyle = 'italic';
  else if (italic === false) variantStyle = 'up';
  const result: PrivateStyle = { ...base };
  delete result.variant;
  delete result.variantStyle;
  if (variant) result.variant = variant;
  if (variantStyle) result.variantStyle = variantStyle;
  return result;
}

/** the style `call(...)` gives content that already has `style` */
export function applyTypstStyle(
  style: PrivateStyle,
  call: string
): PrivateStyle {
  const typst = decompose(style);
  if (call === 'bold') typst.bold = true;
  else if (call === 'upright') typst.italic = false;
  else if (call === 'italic') typst.italic = true;
  else typst.family = call === 'serif' ? undefined : call;
  return compose(style, typst);
}

/** the style calls, outermost first, that turn content styled `outer` into `inner` */
export function typstStyleCalls(
  outer: PrivateStyle,
  inner: PrivateStyle
): string[] {
  const from = decompose(outer);
  const to = decompose(inner);
  const calls: string[] = [];
  if (to.family !== from.family) calls.push(to.family ?? 'serif');
  if (to.bold && !from.bold) calls.push('bold');
  if (to.italic !== undefined && to.italic !== from.italic)
    calls.push(to.italic ? 'italic' : 'upright');
  return calls;
}
