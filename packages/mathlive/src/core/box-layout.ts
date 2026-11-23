// Texpile: the canvas backend. Lays a Box tree out the way core.less and the browser lay out its markup, in em
// from the formula's left edge and baseline (y down), and lists what to paint. Called after applyInterBoxSpacing and
// makeStruts, so widths are recomputed here: Box widths are summed before the inter-box skips exist.
import type { Box } from './box';
import { getCharacterMetrics } from './font-metrics';
import { svgBodyPieces } from './svg-box';
import { svgOverlayPieces, type SvgOverlayPiece } from './svg-overlay';
import { ARRAY_ROWS, VBOX_ROWS, type VBoxRow } from './v-box';
import type { FontName } from './types';
import type {
  MathColor,
  MathLayout,
  MathPaintItem,
  MathRadius,
  MathRect,
} from '../public/mathlive-ssr';

export type BoxLayoutOptions = {
  /** width in px of `text` in a canvas font string */
  measure: (font: string, text: string) => number;
  /** the font families of the text the formula stands in, which `\text` inherits */
  family: string;
  /** an editing render: collect atom rects, the caret, the selection and macro calls */
  editing: boolean;
  /** px ascent and descent of a canvas font string: a glyph's atom rect is its inline box, as the DOM measured it */
  extents?: (font: string) => { ascent: number; descent: number };
};

const TEXT_STACK =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";
const MONO_STACK =
  "'Berkeley Mono', 'IBM Plex Mono', 'Source Code Pro', Consolas, 'Roboto Mono', Menlo, 'Bitstream Vera Sans Mono', 'DejaVu Sans Mono', Monaco, Courier, monospace";
/** the formula's own font: the paint takes it from the element the formula stands in */
export const INHERITED_FAMILY = 'inherit';
const MEASURE_PX = 100;
const COMBINING = /\p{Mn}/u;
const MU = 1 / 18;
/** core.less draws rules at max(1px, .04em); the painter keeps them a device pixel at least */
const HAIRLINE = 0.04;

type FontStyle = 'normal' | 'italic' | 'oblique';
type TextAlign = 'left' | 'center' | 'right';

type Inherited = {
  /** font size in root em */
  readonly size: number;
  readonly family: string;
  readonly style: FontStyle;
  readonly weight: number;
  readonly smallCaps: boolean;
  readonly color: MathColor;
  readonly opacity: number;
  readonly align: TextAlign;
  readonly text: boolean;
  readonly emph: number;
};

type Look = Inherited & {
  /** the em of this box's own lengths, in root em */
  readonly em: number;
};

type Draft = {
  -readonly [K in keyof Inherited]: Inherited[K];
};

const ROOT: Inherited = {
  size: 1,
  family: INHERITED_FAMILY,
  style: 'normal',
  weight: 400,
  smallCaps: false,
  color: 'current',
  opacity: 1,
  align: 'left',
  text: false,
  emph: 0,
};

const ALIGN_CLASSES: Record<string, TextAlign> = {
  'ML__center': 'center',
  'ML__left': 'left',
  'ML__right': 'right',
  'ML__msubsup': 'left',
  'col-align-l': 'left',
  'col-align-c': 'center',
  'col-align-m': 'center',
  'col-align-r': 'right',
};

// core.less's single-class rules in their order there, so a later one wins as in the cascade
const CLASS_RULES: [string, (draft: Draft) => void][] = [
  ['ML__small-delim', (d) => (d.family = 'KaTeX_Main')],
  [
    'ML__text',
    // the static sheet leaves --_text-font-family undefined, so text inherits the font around the formula
    (d) => {
      d.family = INHERITED_FAMILY;
      d.text = true;
    },
  ],
  [
    'ML__cmr',
    (d) => {
      d.family = 'KaTeX_Main';
      d.style = 'normal';
    },
  ],
  [
    'ML__mathit',
    (d) => {
      d.family = 'KaTeX_Math';
      d.style = 'italic';
    },
  ],
  [
    'ML__mathbf',
    (d) => {
      d.family = 'KaTeX_Main';
      d.weight = 700;
    },
  ],
  [
    'ML__mathbfit',
    (d) => {
      d.family = 'KaTeX_Math';
      d.weight = 700;
      d.style = 'italic';
    },
  ],
  ['ML__ams', (d) => (d.family = 'KaTeX_AMS')],
  ['ML__bb', (d) => (d.family = 'KaTeX_AMS')],
  ['ML__cal', (d) => (d.family = 'KaTeX_Caligraphic')],
  ['ML__frak', (d) => (d.family = 'KaTeX_Fraktur')],
  ['ML__tt', (d) => (d.family = 'KaTeX_Typewriter')],
  ['ML__script', (d) => (d.family = 'KaTeX_Script')],
  ['ML__sans', (d) => (d.family = 'KaTeX_SansSerif')],
  ['ML__series_ul', (d) => (d.weight = 100)],
  ['ML__series_el', (d) => (d.weight = 100)],
  ['ML__series_l', (d) => (d.weight = 200)],
  ['ML__series_sl', (d) => (d.weight = 300)],
  ['ML__series_sb', (d) => (d.weight = 500)],
  ['ML__bold', (d) => (d.weight = 700)],
  ['ML__series_eb', (d) => (d.weight = 800)],
  ['ML__series_ub', (d) => (d.weight = 900)],
  ['ML__it', (d) => (d.style = 'italic')],
  ['ML__shape_sc', (d) => (d.smallCaps = true)],
  ['ML__shape_sl', (d) => (d.style = 'oblique')],
  [
    'ML__emph',
    (d) => {
      d.emph += 1;
      d.color = { css: d.emph > 1 ? '#0c7f99' : '#bc2612' };
    },
  ],
  ['ML__delim-size1', (d) => (d.family = 'KaTeX_Size1')],
  ['ML__delim-size2', (d) => (d.family = 'KaTeX_Size2')],
  ['ML__delim-size3', (d) => (d.family = 'KaTeX_Size3')],
  ['ML__delim-size4', (d) => (d.family = 'KaTeX_Size4')],
  // `.ML__delim-mult .delim-size1 > span`: a stacked delimiter's pieces
  ['delim-size1', (d) => (d.family = 'KaTeX_Size1')],
  ['delim-size4', (d) => (d.family = 'KaTeX_Size4')],
  ['ML__accent-body', (d) => (d.family = 'KaTeX_Main')],
  [
    'ML__placeholder',
    (d) => {
      d.family = TEXT_STACK;
      d.color = { role: 'placeholder' };
      d.opacity *= 0.4;
    },
  ],
];

const INLINE_BLOCK_CLASSES = new Set([
  'ML__strut',
  'ML__strut--bottom',
  'ML__sqrt',
  'ML__sqrt-sign',
  'ML__sqrt-line',
  'ML__mfrac',
  'ML__left-right',
  'ML__negativethinspace',
  'ML__thinspace',
  'ML__mediumspace',
  'ML__thickspace',
  'ML__enspace',
  'ML__quad',
  'ML__qquad',
  'ML__llap',
  'ML__rlap',
  'ML__rule',
  'ML__nulldelimiter',
  'ML__op-group',
  'ML__error',
  'ML__vertical-separator',
  'ML__arraycolsep',
  'ML__is-inline',
  'ML__base',
  'ML__latex',
  'ML__notation',
  'ML__box',
]);

const ABSOLUTE_CLASSES = new Set(['ML__inner', 'ML__notation']);

// the frames of \\boxed and \\enclose, which stand against the body they enclose
const FRAME_CLASSES = new Set(['ML__box', 'ML__notation']);

const POSITIONED_CLASSES = new Set([
  'ML__sqrt-sign',
  'ML__accent-combining-char',
  'style-wrap',
  'ML__op-symbol',
  'ML__rule',
  'ML__llap',
  'ML__rlap',
  'ML__bg',
  'ML__notation',
]);

/** widths core.less gives the spacing classes, in em */
const SPACE_WIDTHS: Record<string, number> = {
  ML__thinspace: 3 * MU,
  ML__mediumspace: 4 * MU,
  ML__thickspace: 5 * MU,
  ML__enspace: 0.5,
  ML__quad: 1,
  ML__qquad: 2,
  ML__negativethinspace: 0,
};

const METRIC_FONTS: Record<string, FontName> = {
  'KaTeX_Main/normal/400': 'Main-Regular',
  'KaTeX_Main/italic/400': 'Main-Italic',
  'KaTeX_Main/normal/700': 'Main-Bold',
  'KaTeX_Main/italic/700': 'Main-BoldItalic',
  'KaTeX_Math/italic/400': 'Math-Italic',
  'KaTeX_Math/normal/400': 'Math-Italic',
  'KaTeX_Math/italic/700': 'Math-BoldItalic',
  'KaTeX_AMS/normal/400': 'AMS-Regular',
  'KaTeX_Caligraphic/normal/400': 'Caligraphic-Regular',
  'KaTeX_Fraktur/normal/400': 'Fraktur-Regular',
  'KaTeX_Typewriter/normal/400': 'Typewriter-Regular',
  'KaTeX_Script/normal/400': 'Script-Regular',
  'KaTeX_SansSerif/normal/400': 'SansSerif-Regular',
  'KaTeX_Size1/normal/400': 'Size1-Regular',
  'KaTeX_Size2/normal/400': 'Size2-Regular',
  'KaTeX_Size3/normal/400': 'Size3-Regular',
  'KaTeX_Size4/normal/400': 'Size4-Regular',
};

type Length = { em: number; px: number; percent: number };

const UNITLESS = /^-?\d*\.?\d+(?:e-?\d+)?$/;

function parseLength(value: string | undefined): Length | null {
  if (value === undefined) return null;
  const v = value.trim();
  if (v === '0') return { em: 0, px: 0, percent: 0 };
  if (v.startsWith('calc(') && v.endsWith(')'))
    return parseCalc(v.slice(5, -1));
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)(em|px|%)?$/.exec(v);
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  if (match[2] === 'px') return { em: 0, px: n, percent: 0 };
  if (match[2] === '%') return { em: 0, px: 0, percent: n };
  return { em: n, px: 0, percent: 0 };
}

function scaleLength(length: Length, by: number): Length {
  return {
    em: length.em * by,
    px: length.px * by,
    percent: length.percent * by,
  };
}

/** the sums, differences and products by a number that the markup's calc() holds */
function parseCalc(expression: string): Length | null {
  const tokens = expression.trim().split(/\s+/);
  let at = 0;
  function operand(): { length: Length; unitless: boolean } | null {
    const token = tokens[at++];
    const length = parseLength(token);
    return length ? { length, unitless: UNITLESS.test(token) } : null;
  }
  function term(): Length | null {
    let left = operand();
    while (left && tokens[at] === '*') {
      at++;
      const right = operand();
      if (!right || (!left.unitless && !right.unitless)) return null;
      left = left.unitless
        ? {
            length: scaleLength(right.length, left.length.em),
            unitless: right.unitless,
          }
        : {
            length: scaleLength(left.length, right.length.em),
            unitless: false,
          };
    }
    return left?.length ?? null;
  }
  let total = term();
  while (total && (tokens[at] === '+' || tokens[at] === '-')) {
    const sign = tokens[at++] === '-' ? -1 : 1;
    const next = term();
    if (!next) return null;
    total = {
      em: total.em + sign * next.em,
      px: total.px + sign * next.px,
      percent: total.percent + sign * next.percent,
    };
  }
  return at === tokens.length ? total : null;
}

/** a length in root em; px counted at 16 px to the em, the size Texpile's text has */
function lengthEm(length: Length | null, look: Look, container = 0): number {
  if (!length) return 0;
  return (
    length.em * look.em +
    (length.px / 16) * look.em +
    (length.percent / 100) * container
  );
}

function classesOf(box: Box): string[] {
  return box.classes ? box.classes.split(/\s+/).filter(Boolean) : [];
}

function borderWidthEm(value: string | undefined, look: Look): number {
  if (!value) return 0;
  for (const part of value.split(/\s+/)) {
    const length = parseLength(part);
    if (length) return lengthEm(length, look);
  }
  return 0;
}

function borderColor(value: string | undefined): MathColor {
  if (!value) return 'current';
  const part = value
    .split(/\s+/)
    .find(
      (p) =>
        !parseLength(p) && !/^(solid|dashed|dotted|double|none|hidden)$/.test(p)
    );
  return colorOf(part);
}

function colorOf(css: string | undefined): MathColor {
  if (!css || /^currentcolor$/i.test(css)) return 'current';
  return { css };
}

type Edges = { top: number; right: number; bottom: number; left: number };

/** a box's frame: its border widths and the color they are drawn in */
type Frame = { widths: Edges; color: MathColor; dashed: boolean };

class BoxLayout {
  readonly items: MathPaintItem[] = [];
  readonly backgrounds: MathPaintItem[] = [];
  readonly atoms = new Map<string, MathRect>();
  readonly atomOffsets = new Map<string, readonly number[]>();
  readonly selection: MathRect[] = [];
  readonly macroCalls: MathLayout['macroCalls'][number][] = [];
  /** the rows of the outermost array, which a display numbers one by one */
  readonly rows: { baseline: number }[] = [];
  caret: MathLayout['caret'];
  private readonly widths = new Map<Box, number>();
  private readonly looks = new Map<Box, Look>();
  private readonly anchors = new Map<Box, number>();

  constructor(private readonly options: BoxLayoutOptions) {}

  look(box: Box, parent: Inherited): Look {
    const known = this.looks.get(box);
    if (known) return known;
    const draft: Draft = { ...parent };
    const classes = classesOf(box);
    const scaled =
      box.scale !== 1 &&
      (!!box.value ||
        (box.children?.length ?? 0) > 0 ||
        !!box.svgBody ||
        !!box.svgOverlay);
    if (scaled) draft.size = parent.size * box.scale;
    for (const [name, apply] of CLASS_RULES)
      if (classes.includes(name)) apply(draft);
    if (classes.includes('lcGreek') && classes.includes('ML__mathbf'))
      draft.family = 'KaTeX_Math';
    if (classes.includes('ML__op-symbol')) {
      if (classes.includes('ML__small-op')) draft.family = 'KaTeX_Size1';
      if (classes.includes('ML__large-op')) draft.family = 'KaTeX_Size2';
    }
    for (const name of classes) {
      const align = ALIGN_CLASSES[name];
      if (align) draft.align = align;
    }
    const css = box.cssProperties;
    if (css?.['font-family']) draft.family = css['font-family'];
    if (css?.color) draft.color = colorOf(css.color);
    if (css?.opacity !== undefined)
      draft.opacity *= Number.parseFloat(css.opacity) || 0;
    if (box.type === 'latex') {
      draft.family = MONO_STACK;
      draft.size *= 0.8;
      draft.color = { role: 'latex' };
    }
    const look: Look = { ...draft, em: draft.size };
    this.looks.set(box, look);
    return look;
  }

  private displayOf(box: Box): string {
    const css = box.cssProperties?.display;
    if (css) return css;
    if (VBOX_ROWS.has(box)) return 'inline-table';
    const classes = classesOf(box);
    if (classes.some((name) => INLINE_BLOCK_CLASSES.has(name)))
      return 'inline-block';
    if (box.type === 'skip') return 'inline-block';
    return 'inline';
  }

  private positioned(box: Box): boolean {
    const position = box.cssProperties?.position;
    if (position) return position === 'relative' || position === 'absolute';
    return classesOf(box).some((name) => POSITIONED_CLASSES.has(name));
  }

  private margins(box: Box, look: Look): { left: number; right: number } {
    const css = box.cssProperties;
    let left = lengthEm(parseLength(css?.['margin-left']), look);
    const right = lengthEm(parseLength(css?.['margin-right']), look);
    const classes = classesOf(box);
    if (classes.includes('ML__negativethinspace')) left -= 3 * MU * look.em;
    if (classes.includes('ML__sqrt-index'))
      return { left: 5 * MU * look.em, right: -10 * MU * look.em };
    return { left, right };
  }

  private padding(box: Box, look: Look): { left: number; right: number } {
    const css = box.cssProperties;
    const all = lengthEm(parseLength(css?.padding), look);
    let left = css?.['padding-left']
      ? lengthEm(parseLength(css['padding-left']), look)
      : all;
    let right = css?.['padding-right']
      ? lengthEm(parseLength(css['padding-right']), look)
      : all;
    const classes = classesOf(box);
    if (classes.includes('ML__label_padding')) {
      left = 0.5 * look.em;
      right = 0.5 * look.em;
    }
    // .4ex in the system font: about .2em
    if (classes.includes('ML__placeholder')) {
      left = 0.2 * look.em;
      right = 0.2 * look.em;
    }
    return { left, right };
  }

  frame(box: Box, look: Look): Frame | null {
    const css = box.cssProperties;
    if (!css) return null;
    const all = borderWidthEm(css.border, look);
    const widths: Edges = {
      top: css['border-top'] ? borderWidthEm(css['border-top'], look) : all,
      right: css['border-right']
        ? borderWidthEm(css['border-right'], look)
        : css['border-right-width']
          ? borderWidthEm(css['border-right-width'], look)
          : all,
      bottom: css['border-bottom']
        ? borderWidthEm(css['border-bottom'], look)
        : all,
      left: css['border-left'] ? borderWidthEm(css['border-left'], look) : all,
    };
    if (!widths.top && !widths.right && !widths.bottom && !widths.left)
      return null;
    const spec =
      css.border ??
      css['border-right'] ??
      css['border-top'] ??
      css['border-bottom'] ??
      css['border-left'];
    const color = css['border-color']
      ? colorOf(css['border-color'])
      : borderColor(spec);
    return {
      widths,
      color: color === 'current' ? look.color : color,
      dashed: /dashed|dotted/.test(spec ?? ''),
    };
  }

  /** advance width of a glyph run in root em: the metrics where the KaTeX fonts have the glyph, else measured */
  private runWidth(box: Box, look: Look): number {
    const text = box.value;
    const metricFont =
      METRIC_FONTS[`${look.family}/${look.style}/${look.weight}`];
    if (!look.text && box.type !== 'latex' && metricFont) {
      let width = 0;
      for (const char of text) {
        // a combining mark (\vec's arrow) advances nothing in the page, whatever the metrics say
        if (COMBINING.test(char)) continue;
        const metrics = getCharacterMetrics(char.codePointAt(0), metricFont);
        width += metrics.defaultMetrics
          ? this.measureEm(look, char)
          : metrics.width;
      }
      return width * look.size;
    }
    if (!look.text && box.type !== 'latex') return box._width * look.size;
    const width = this.measureEm(look, text);
    return box.type === 'latex'
      ? width - 0.05 * text.length
      : width * look.size;
  }

  private measureEm(look: Look, text: string): number {
    const family =
      look.family === INHERITED_FAMILY ? this.options.family : look.family;
    return (
      this.options.measure(
        `${fontPrefix(look)} ${MEASURE_PX}px ${family}`,
        text
      ) / MEASURE_PX
    );
  }

  /** the explicit width an inline-block (or table) gives itself, in root em; null when its content decides */
  private explicitWidth(
    box: Box,
    look: Look,
    container: number
  ): number | null {
    // the stretchy body's own inline-block, as wide as its min-width; its slices span the row instead
    if (box.svgBody) return svgBodyPieces(box.svgBody).minWidth * look.em;
    if (this.displayOf(box) === 'inline') return null;
    const classes = classesOf(box);
    if (classes.includes('ML__llap') || classes.includes('ML__rlap')) return 0;
    const css = box.cssProperties?.width;
    if (css !== undefined) return lengthEm(parseLength(css), look, container);
    // the markup writes these rounded up to hundredths of an em, and the page lays that out
    if (box.type === 'skip')
      return (Math.ceil(box.width * 100) / 100) * look.size;
    if (box.hasExplicitWidth)
      return (Math.ceil(box._width * 100) / 100) * look.size;
    for (const name of classes)
      if (name in SPACE_WIDTHS) return SPACE_WIDTHS[name] * look.em;
    return null;
  }

  /** border-box width in root em */
  width(box: Box, parent: Inherited, container = 0): number {
    // a percentage is of the container the box is placed in
    const relative = box.cssProperties?.width?.includes('%') ?? false;
    const known = relative ? undefined : this.widths.get(box);
    if (known !== undefined) return known;
    const look = this.look(box, parent);
    const padding = this.padding(box, look);
    const frame = this.frame(box, look);
    const edges =
      padding.left +
      padding.right +
      (frame ? frame.widths.left + frame.widths.right : 0);
    const explicit = this.explicitWidth(box, look, container);
    let width: number;
    if (explicit !== null)
      width =
        box.cssProperties?.['box-sizing'] === 'border-box' ||
        classesOf(box).includes('ML__rule')
          ? Math.max(explicit, edges)
          : explicit + edges;
    else width = this.contentWidth(box, look) + edges;
    if (!relative) this.widths.set(box, width);
    return width;
  }

  private contentWidth(box: Box, look: Look): number {
    const rows = VBOX_ROWS.get(box);
    if (rows) return this.stackWidth(rows, look);
    let width = box.value ? this.runWidth(box, look) : 0;
    for (const child of box.children ?? []) width += this.advance(child, look);
    return width;
  }

  private stackWidth(rows: readonly VBoxRow[], look: Look): number {
    let width = 0;
    for (const row of rows) {
      const wrap = this.look(row.wrap, look);
      const padding = this.padding(row.wrap, wrap);
      width = Math.max(
        width,
        (row.marginLeft + row.marginRight) * wrap.em +
          padding.left +
          padding.right +
          this.advance(row.box, wrap)
      );
    }
    return width;
  }

  /** the horizontal room a box takes in its line: margins included, absolute boxes none */
  advance(box: Box, parent: Inherited): number {
    if (this.absolute(box)) return 0;
    const look = this.look(box, parent);
    const margins = this.margins(box, look);
    return margins.left + this.width(box, parent) + margins.right;
  }

  private absolute(box: Box): boolean {
    return (
      box.cssProperties?.position === 'absolute' ||
      classesOf(box).some((name) => ABSOLUTE_CLASSES.has(name))
    );
  }

  /** places a box whose margin box starts at x, its baseline at y; container: the positioned ancestor, origins: the
   * left edges of the boxes the markup's offsetParent chain runs through, outermost first */
  place(
    box: Box,
    x: number,
    y: number,
    parent: Inherited,
    container: { x: number; width: number },
    origins: readonly number[] = []
  ): void {
    const look = this.look(box, parent);
    const css = box.cssProperties;
    const margins = this.margins(box, look);
    let left = x + margins.left;
    let baseline = y;
    if (css?.['vertical-align'])
      baseline -= lengthEm(parseLength(css['vertical-align']), look);
    const positioned = this.positioned(box);
    if (positioned && css?.top)
      baseline += lengthEm(parseLength(css.top), look);
    if (positioned && css?.left)
      left += lengthEm(parseLength(css.left), look, container.width);
    const classes = classesOf(box);
    if (classes.includes('ML__accent-combining-char')) left += 0.24 * look.em;
    if (this.absolute(box) && !classes.includes('ML__inner'))
      left =
        container.x +
        (positioned
          ? lengthEm(parseLength(css?.left), look, container.width)
          : 0);
    const anchored = this.anchors.get(box);
    if (anchored !== undefined) baseline = anchored;
    const width = this.width(box, parent, container.width);
    const inner = positioned ? { x: left, width } : container;
    const offsetParent = positioned || classes.includes('ML__base');
    const within = offsetParent ? [...origins, left] : origins;
    const empty = !box.value && !(box.children?.length ?? 0) && !box.svgBody;
    // a box's height and depth are in its parent's em
    let top = baseline - box.height * parent.size;
    let bottom = baseline + box.depth * parent.size;
    if (anchored !== undefined) {
      // the notation's height holds its padding twice and its depth not at all, the box's holds it once each
      const padding = classes.includes('ML__notation')
        ? -(parseLength(css?.left)?.em ?? 0) * look.em
        : 0;
      bottom += padding;
      top = bottom - lengthEm(parseLength(css?.height), look);
    }
    const visible = look.opacity > 0;

    if (visible) {
      this.decorate(box, look, left, width, top, bottom, empty);
      if (box.svgOverlay)
        this.overlay(box, look, {
          x: left,
          y: top,
          width,
          height: bottom - top,
        });
    }

    const padding = this.padding(box, look);
    const frame = this.frame(box, look);
    const contentX = left + (frame?.widths.left ?? 0) + padding.left;

    if (box.value && visible) {
      const font = paintFont(look);
      this.items.push({
        kind: 'glyphs',
        x: contentX,
        y: baseline,
        text: box.value,
        font,
        color: look.color,
        opacity: look.opacity,
      });
    }
    if (box.svgBody && visible) this.stretchy(box, look, baseline, inner);
    const arrayRows = ARRAY_ROWS.get(box);
    if (arrayRows && this.rows.length === 0)
      for (const shift of arrayRows)
        this.rows.push({ baseline: baseline + shift });
    const rows = VBOX_ROWS.get(box);
    if (rows)
      this.placeStack(rows, contentX, baseline, look, width, [
        ...within,
        contentX,
      ]);
    else if (box.children) {
      const hangsLeft = classes.includes('ML__llap');
      let cx = contentX;
      for (const child of box.children) {
        if (classesOf(child).some((name) => FRAME_CLASSES.has(name)))
          this.anchors.set(child, this.flowBaseline(box, look, baseline));
        const at =
          classesOf(child).includes('ML__inner') && hangsLeft
            ? cx - this.width(child, look)
            : cx;
        this.place(child, at, baseline, look, inner, within);
        cx += this.advance(child, look);
      }
    }
    if (this.options.editing) {
      // a glyph's or an empty span's box is the line its font makes, as getBoundingClientRect measured it
      const spanned = empty && this.displayOf(box) === 'inline';
      const extents = box.value || spanned ? this.extents(look) : null;
      // the caret span follows the box past its right margin, on its parent's baseline and in its parent's font
      this.note(
        box,
        left,
        width,
        margins.right,
        extents ? baseline - extents.ascent : top,
        extents ? baseline + extents.descent : bottom,
        y,
        parent.size
      );
      if (box.id && !this.atomOffsets.has(box.id))
        this.atomOffsets.set(box.id, [...origins, left]);
    }
  }

  /** the baseline the first box in the flow sits on, which a frame among its siblings encloses */
  private flowBaseline(box: Box, look: Look, baseline: number): number {
    const body = box.children?.find((child) => !this.absolute(child));
    if (!body) return baseline;
    const own = this.look(body, look);
    const css = body.cssProperties;
    let at = baseline - lengthEm(parseLength(css?.['vertical-align']), own);
    if (this.positioned(body)) at += lengthEm(parseLength(css?.top), own);
    return at;
  }

  /** the strokes an svg overlay draws over its box, in the box's em */
  private overlay(box: Box, look: Look, rect: MathRect): void {
    const em = look.em;
    const w = rect.width / em;
    const h = rect.height / em;
    const at = (value: string, extent: number): number =>
      value.endsWith('%')
        ? (Number.parseFloat(value) / 100) * extent
        : Number.parseFloat(value);
    const units = (value: string | undefined, fallback: number): number => {
      const length = parseLength(value);
      return length ? length.em + length.px / 16 : fallback;
    };
    const ink = (value: string | undefined): MathColor | undefined => {
      if (!value || value === 'none') return undefined;
      if (/^currentcolor$/i.test(value) || value.startsWith('var('))
        return look.color;
      return { css: value };
    };
    for (const piece of svgOverlayPieces(box.svgOverlay!, box.svgStyle)) {
      const d = overlayPath(piece, at, w, h);
      if (!d) continue;
      const { attributes } = piece;
      const dash = attributes['stroke-dasharray']
        ?.split(/[\s,]+/)
        .map((n) => Number.parseFloat(n) / 16);
      this.items.push({
        kind: 'path',
        d,
        viewBox: [-1, -1, w + 2, h + 2],
        box: {
          x: rect.x - em,
          y: rect.y - em,
          width: (w + 2) * em,
          height: (h + 2) * em,
        },
        aspect: 'none',
        fill: ink(attributes.fill),
        stroke: ink(attributes.stroke),
        strokeWidth: units(attributes['stroke-width'], 1),
        dash: dash?.length ? dash : undefined,
      });
    }
  }

  private placeStack(
    rows: readonly VBoxRow[],
    x: number,
    baseline: number,
    look: Look,
    width: number,
    origins: readonly number[]
  ): void {
    for (const row of rows) {
      const wrap = this.look(row.wrap, look);
      const padding = this.padding(row.wrap, wrap);
      const from = x + row.marginLeft * wrap.em;
      const room = width - (row.marginLeft + row.marginRight) * wrap.em;
      const inner = room - padding.left - padding.right;
      const own = this.advance(row.box, wrap);
      const shift =
        padding.left +
        (wrap.align === 'center'
          ? (inner - own) / 2
          : wrap.align === 'right'
            ? inner - own
            : 0);
      const rowBaseline = baseline + row.baseline * look.em;
      this.placeRule(row.box, wrap, from, room, rowBaseline);
      this.place(
        row.box,
        from + shift,
        rowBaseline,
        wrap,
        { x: from, width: room },
        [...origins, from]
      );
    }
  }

  /** the rules core.less draws with pseudo-elements: fraction bars, radical bars, over and under lines */
  private placeRule(
    box: Box,
    parent: Inherited,
    x: number,
    width: number,
    baseline: number
  ): void {
    const classes = classesOf(box);
    const look = this.look(box, parent);
    if (look.opacity <= 0) return;
    const color = look.color;
    const thickness = Math.max(
      HAIRLINE * look.em,
      (box.height + box.depth) * parent.size
    );
    if (
      classes.includes('ML__frac-line') ||
      classes.includes('ML__sqrt-line')
    ) {
      // a pseudo-element pulled up by its own height from the top of the box, which sits on the row's baseline
      this.items.push({
        kind: 'rule',
        x,
        y: baseline - thickness - HAIRLINE * look.em,
        w: width,
        h: HAIRLINE * look.em,
        color,
      });
    } else if (
      classes.includes('overline-line') ||
      classes.includes('underline-line')
    ) {
      // a border at the top of the box, which sits on the row's baseline
      this.items.push({
        kind: 'rule',
        x,
        y: baseline - (box.height + box.depth) * parent.size,
        w: width,
        h: HAIRLINE * look.em,
        color,
      });
    }
  }

  /** backgrounds, frames and the error tint under the box's content */
  private decorate(
    box: Box,
    look: Look,
    x: number,
    width: number,
    top: number,
    bottom: number,
    empty: boolean
  ): void {
    const css = box.cssProperties;
    const classes = classesOf(box);
    const background = css?.['background-color'];
    const rect = { x, y: top, width, height: bottom - top };
    const radius = cornerRadius(css?.['border-radius'], look, rect);
    if (background && !/^transparent$/i.test(background))
      this.backgrounds.push({
        kind: 'fill',
        rect,
        color: colorOf(background),
        radius,
      });
    if (classes.includes('ML__error')) {
      const depth = bottom + 3 / 16;
      this.backgrounds.push({
        kind: 'fill',
        rect: { x, y: top, width, height: depth - top },
        color: { role: 'error' },
      });
    }
    const frame = this.frame(box, look);
    if (frame) {
      const framed = empty
        ? {
            x,
            y: bottom - lengthEm(parseLength(css?.height), look),
            width,
            height: lengthEm(parseLength(css?.height), look),
          }
        : rect;
      this.items.push({
        kind: 'frame',
        rect: framed,
        widths: [
          frame.widths.top,
          frame.widths.right,
          frame.widths.bottom,
          frame.widths.left,
        ],
        color: frame.color,
        dash: frame.dashed ? [3 * HAIRLINE, 3 * HAIRLINE] : undefined,
        radius,
      });
    }
  }

  /** a stretchy arrow, brace or wide accent: its slices across the row it stands in */
  private stretchy(
    box: Box,
    look: Look,
    baseline: number,
    container: { x: number; width: number }
  ): void {
    const { height, pieces } = svgBodyPieces(box.svgBody!);
    const accent = pieces.length === 1 && pieces[0].aspect === 'none';
    const h = height * look.em;
    const top = accent ? baseline - h / 2 : baseline - h;
    for (const piece of pieces) {
      this.items.push({
        kind: 'path',
        d: piece.d,
        viewBox: piece.viewBox,
        box: {
          x: container.x + piece.left * container.width,
          y: top,
          width: piece.width * container.width,
          height: h,
        },
        aspect: piece.aspect,
        fill: look.color,
      });
    }
  }

  /** atom rects, the caret and the selection of an editing render */
  /** the content area of a glyph run's font, in root em */
  private extents(look: Look): { ascent: number; descent: number } | null {
    const read = this.options.extents;
    if (!read) return null;
    const family =
      look.family === INHERITED_FAMILY ? this.options.family : look.family;
    const { ascent, descent } = read(
      `${fontPrefix(look)} ${MEASURE_PX}px ${family}`
    );
    return {
      ascent: (ascent / MEASURE_PX) * look.em,
      descent: (descent / MEASURE_PX) * look.em,
    };
  }

  /** the atom's rect is its border box, as getBoundingClientRect measured it; the caret span comes after its margin */
  private note(
    box: Box,
    x: number,
    width: number,
    marginRight: number,
    top: number,
    bottom: number,
    baseline: number,
    em: number
  ): void {
    const rect = { x, y: top, width, height: bottom - top };
    if (box.id) {
      const known = this.atoms.get(box.id);
      this.atoms.set(box.id, known ? union(known, rect) : rect);
    }
    if (box.isSelected && box.value) this.selection.push(rect);
    if (box.caret === 'math' || box.caret === 'text' || box.caret === 'latex')
      this.caret = {
        x: x + width + marginRight,
        top,
        bottom,
        baseline,
        em,
        kind: box.caret,
      };
    const latex = box.attributes?.['data-latex'];
    if (latex !== undefined && box.attributes?.part?.startsWith('macro'))
      this.macroCalls.push({
        rect,
        latex,
        command: latex.match(/^\\[a-zA-Z@]+/)?.[0] ?? latex,
        selected: box.attributes.part.includes('selected'),
      });
  }
}

function cornerRadius(
  value: string | undefined,
  look: Look,
  rect: MathRect
): MathRadius | undefined {
  const length = parseLength(value);
  if (!length) return undefined;
  if (length.percent)
    return [
      (length.percent / 100) * rect.width,
      (length.percent / 100) * rect.height,
    ];
  return lengthEm(length, look) || undefined;
}

function overlayPath(
  piece: SvgOverlayPiece,
  at: (value: string, extent: number) => number,
  width: number,
  height: number
): string {
  const { shape } = piece;
  if (shape.tag === 'path') return shape.d;
  if (shape.tag === 'line')
    return `M ${at(shape.x1, width)} ${at(shape.y1, height)} L ${at(shape.x2, width)} ${at(shape.y2, height)}`;
  const points = shape.points.trim().split(/\s+/);
  return points.length ? `M ${points.join(' L ')} Z` : '';
}

function union(a: MathRect, b: MathRect): MathRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function fontPrefix(look: Inherited): string {
  const style = look.style === 'normal' ? '' : `${look.style} `;
  const variant = look.smallCaps ? 'small-caps ' : '';
  return `${style}${variant}${look.weight}`;
}

/** a canvas font string with the size in em: the painter puts the pixel size in */
function paintFont(look: Look): string {
  return `${fontPrefix(look)} ${round(look.em)}em ${look.family}`;
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Lays the struts box of makeStruts out: the ascent and descent are the struts' (core.less gives each .5em at
 * least), the width the content's after inter-box spacing.
 */
export function layoutBox(root: Box, options: BoxLayoutOptions): MathLayout {
  const layout = new BoxLayout(options);
  const width = layout.width(root, ROOT);
  layout.place(root, 0, 0, ROOT, { x: 0, width });
  // the struts as the markup writes them, heights rounded up to hundredths, each at least .5em tall
  let ascent = 0;
  let descent = 0;
  for (const child of root.children ?? []) {
    const classes = classesOf(child);
    if (
      !classes.includes('ML__strut') &&
      !classes.includes('ML__strut--bottom')
    )
      continue;
    const look = layout.look(child, ROOT);
    const height = Math.max(
      0.5,
      lengthEm(parseLength(child.cssProperties?.height), look)
    );
    const below = -lengthEm(
      parseLength(child.cssProperties?.['vertical-align']),
      look
    );
    ascent = Math.max(ascent, height - below);
    descent = Math.max(descent, below);
  }
  return {
    width,
    ascent,
    descent,
    items: [...layout.backgrounds, ...layout.items],
    atoms: layout.atoms,
    atomOffsets: layout.atomOffsets,
    caret: layout.caret,
    selection: layout.selection,
    macroCalls: layout.macroCalls,
    rows: layout.rows,
  };
}
