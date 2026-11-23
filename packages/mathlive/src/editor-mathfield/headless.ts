// Texpile: a field with no element. Its host lays it out and draws it (a canvas), holds the keyboard and calls the
// keyboard delegate itself, and answers every geometry question from the layout it was handed.
import type { KeyboardDelegate } from '../editor/keyboard';
import type { MathLayout } from '../public/mathlive-ssr';
import type { MathGeometry } from './geometry';
import type { _Mathfield } from './mathfield-private';

/** the host's pointer capture, which forwards the moves of a press that started in the formula */
export type PointerCapture = {
  start(onMove: (event: PointerEvent | MouseEvent) => void, onEnd: () => void): void;
  stop(): void;
};

export type HeadlessHost = {
  readonly geometry: MathGeometry;
  readonly pointerCapture: PointerCapture;
  /** a new editing render: the caret, the selection or the content changed */
  layoutChanged(layout: MathLayout): void;
  /** px width of `text` in a canvas font string */
  measure(font: string, text: string): number;
  /** px ascent and descent of a canvas font string */
  extents(font: string): { ascent: number; descent: number };
  /** the font around the formula, which `\text` takes */
  family(): string;
  /** MathLive's own menu key: the host's menu at the caret */
  openMenu?(): boolean;
  /** a command that needs the keyboard: the host takes it back */
  focus?(): void;
};

/** the keyboard stays with the host: focus is the field's flag, and the IME window follows the host's caret */
export function headlessKeyboardDelegate(mf: _Mathfield): KeyboardDelegate {
  return {
    cancelComposition: () => {},
    blur: () => mf.onBlur(),
    focus: () => mf.onFocus(),
    hasFocus: () => mf.hasFocus(),
    setValue: () => {},
    setAriaLabel: () => {},
    moveTo: () => {},
    dispose: () => {},
  };
}
