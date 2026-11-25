/**
 * Texpile: a mathfield with no element, for a host that lays the formula out and draws it itself (a canvas). The host
 * holds the keyboard and calls the keyboard delegate, answers the geometry questions from its layout and gets a new
 * layout after every change. Events (`input`, `beforeinput`, `selection-change`, `move-out`, `change`, `blur`) are
 * dispatched on the field, as a `MathfieldElement` dispatches them.
 *
 * @category Headless
 */
import type { Selector } from './commands';
import type {
  InsertOptions,
  MacroDictionary,
  Offset,
  OutputFormat,
  ParseMode,
  Range,
  Selection,
  Style,
} from './core-types';
import type { InlineShortcutDefinitions, Keybinding, TypstShortcut } from './options';
import type { MathLayout } from './mathlive-ssr';
import { _Mathfield } from '../editor-mathfield/mathfield-private';
import { offsetFromPoint, onPointerDown } from '../editor-mathfield/pointer-input';
import {
  containsHighlightOf,
  render,
  requestUpdate,
  selectionRectsOf,
} from '../editor-mathfield/render';
import { Atom } from '../core/atom-class';
import {
  hideSuggestionPopover,
  isSuggestionPopoverVisible,
} from '../editor/suggestion-popover';
import { atomToTypst } from '../typst/write';
import { fromJson } from '../core/atom';

/** client px */
export type MathFieldRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/** the caret's right edge, its bottom and its height, client px */
export type MathCaretPoint = { x: number; y: number; height: number };

/** where the formula stands on screen, answered by the host from its layout */
export interface MathGeometry {
  /** the boxes of the atom with this id, null when it draws none */
  atomRect(id: string): MathFieldRect | null;
  /** the first box of the atom with this id, in one unscrolled space for the whole formula: vertical moves compare x */
  atomOffsetRect(id: string): MathFieldRect | null;
  caretPoint(): MathCaretPoint | null;
  /** the formula's own box */
  contentRect(): MathFieldRect;
  /** the box selection rects are measured from */
  fieldRect(): MathFieldRect;
  /** the box a press enters the formula through */
  hostRect(): MathFieldRect;
  /** client px per layout px */
  readonly scale: number;
  /** an overflowing display's sideways scroll, px */
  readonly scrollX: number;
  scrollBy(dx: number): void;
}

/** the host's pointer capture: the moves of a press that started in the formula */
export type MathPointerCapture = {
  start(
    onMove: (event: PointerEvent | MouseEvent) => void,
    onEnd: () => void
  ): void;
  stop(): void;
};

export type HeadlessMathfieldOptions = {
  value: string;
  syntax: 'latex' | 'typst';
  /** `inline-math` lays out in text style, `math` in display style */
  defaultMode: 'math' | 'inline-math';
  readOnly: boolean;
  colorMap?: (name: string) => string | undefined;
  geometry: MathGeometry;
  pointerCapture: MathPointerCapture;
  /** a new editing render: the caret, the selection or the content changed */
  layoutChanged(layout: MathLayout): void;
  /** px width of `text` in a canvas font string */
  measure(font: string, text: string): number;
  /** px ascent and descent of a canvas font string, the inline box a glyph's atom stands in */
  extents(font: string): { ascent: number; descent: number };
  /** the font around the formula, which `\text` takes */
  family(): string;
  /** MathLive's own menu key: the host's menu */
  openMenu?(): boolean;
  /** a command that needs the keyboard (the clipboard commands): the host takes it back */
  focus?(): void;
};

/** @category Headless */
export class HeadlessMathfield extends EventTarget {
  private readonly _mathfield: _Mathfield;

  constructor(options: HeadlessMathfieldOptions) {
    super();
    this._mathfield = new _Mathfield(undefined, {
      value: options.value,
      syntax: options.syntax,
      defaultMode: options.defaultMode,
      readOnly: options.readOnly,
      colorMap: options.colorMap,
      mathVirtualKeyboardPolicy: 'manual',
      eventSink: this,
      headless: {
        geometry: options.geometry,
        pointerCapture: options.pointerCapture,
        layoutChanged: options.layoutChanged,
        measure: options.measure,
        extents: options.extents,
        family: options.family,
        openMenu: options.openMenu,
        focus: options.focus,
      },
    });
  }

  /** the newest editing render, made now when one is owed */
  renderNow(): void {
    if (this._mathfield.dirty) render(this._mathfield, { interactive: true });
  }

  executeCommand(selector: Selector | [Selector, ...unknown[]]): boolean {
    return this._mathfield.executeCommand(selector);
  }

  getValue(format?: OutputFormat): string;
  getValue(start: Offset, end: Offset, format?: OutputFormat): string;
  getValue(range: Range, format?: OutputFormat): string;
  getValue(selection: Selection, format?: OutputFormat): string;
  getValue(
    arg1?: Offset | Range | Selection | OutputFormat,
    arg2?: Offset | OutputFormat,
    arg3?: OutputFormat
  ): string {
    return this._mathfield.model.getValue(arg1 as any, arg2 as any, arg3);
  }

  setValue(value: string, options?: InsertOptions): void {
    if (this._mathfield.model.getValue() === value) return;
    this._mathfield.setValue(value, options ?? { silenceNotifications: true, mode: 'math' });
  }

  insert(s: string, options?: InsertOptions): boolean {
    return this._mathfield.insert(s, options);
  }

  applyStyle(style: Readonly<Style>, options?: Range | { range?: Range; operation?: 'set' | 'toggle' }): void {
    this._mathfield.applyStyle(style, options);
  }

  queryStyle(style: Readonly<Style>): 'some' | 'all' | 'none' {
    return this._mathfield.queryStyle(style);
  }

  get selection(): Readonly<Selection> {
    return this._mathfield.model.selection;
  }

  set selection(sel: Selection | Offset) {
    this._mathfield.model.selection = typeof sel === 'number' ? { ranges: [[sel, sel]] } : sel;
    requestUpdate(this._mathfield);
  }

  get selectionIsCollapsed(): boolean {
    return this._mathfield.model.selectionIsCollapsed;
  }

  get position(): Offset {
    return this._mathfield.model.position;
  }

  set position(offset: Offset) {
    this._mathfield.model.position = offset;
    requestUpdate(this._mathfield);
  }

  get lastOffset(): Offset {
    return this._mathfield.model.lastOffset;
  }

  get mode(): ParseMode {
    return this._mathfield.model.mode;
  }

  set mode(value: ParseMode) {
    this._mathfield.switchMode(value);
  }

  get syntax(): 'latex' | 'typst' {
    return this._mathfield.options.syntax;
  }

  get readOnly(): boolean {
    return this._mathfield.options.readOnly;
  }

  set readOnly(value: boolean) {
    this._mathfield.setOptions({ readOnly: value });
  }

  get macros(): Readonly<MacroDictionary> {
    return this._mathfield.getOption('macros') as MacroDictionary;
  }

  set macros(value: MacroDictionary) {
    this._mathfield.setOptions({ macros: value });
  }

  get keybindings(): readonly Keybinding[] {
    return this._mathfield.getOption('keybindings');
  }

  set keybindings(value: readonly Keybinding[]) {
    this._mathfield.setOptions({ keybindings: value });
  }

  get inlineShortcuts(): Readonly<InlineShortcutDefinitions> {
    return this._mathfield.getOption('inlineShortcuts');
  }

  set inlineShortcuts(value: InlineShortcutDefinitions) {
    this._mathfield.setOptions({ inlineShortcuts: value });
  }

  get typstShortcuts(): Readonly<Record<string, TypstShortcut>> {
    return this._mathfield.getOption('typstShortcuts');
  }

  set typstShortcuts(value: Record<string, TypstShortcut>) {
    this._mathfield.setOptions({ typstShortcuts: value });
  }

  /** the x a vertical move aims at instead of the caret's own, in the space of `atomOffsetRect`; undefined clears it */
  set verticalGoalX(x: number | undefined) {
    this._mathfield.verticalGoalX = x;
  }

  /** client px; bias 0 puts a point left of an atom's midline before it */
  getOffsetFromPoint(x: number, y: number, options?: { bias?: -1 | 0 | 1 }): Offset {
    return offsetFromPoint(this._mathfield, x, y, options);
  }

  /** the selection rects to draw, relative to `fieldRect`, as the custom element places them */
  selectionRects(): MathFieldRect[] {
    return selectionRectsOf(this._mathfield);
  }

  /** the zone around the caret that wears the contains highlight, relative to `fieldRect` */
  containsHighlight(): MathFieldRect | null {
    return containsHighlightOf(this._mathfield);
  }

  /** MathLive's undo snapshots, newest first: what the field held and where its selection was */
  undoSnapshots(format: 'latex-expanded' | 'typst'): { value: string; selection: Selection }[] {
    const mf = this._mathfield;
    return mf.undoManager
      .states()
      .map((state) => {
        const root = fromJson(state.content);
        const value =
          format === 'typst'
            ? atomToTypst(root.body ?? [])
            : Atom.serialize([root], { expandMacro: true, defaultMode: mf.options.defaultMode });
        return { value, selection: state.selection };
      })
      .reverse();
  }

  /** a mousedown on the formula, client coordinates; its moves come through the pointer capture */
  onPointerDown(event: PointerEvent | MouseEvent): void {
    onPointerDown(this._mathfield, event as PointerEvent);
  }

  hasFocus(): boolean {
    return this._mathfield.hasFocus();
  }

  /** the field focused and the host asked for the keyboard */
  focus(): void {
    this._mathfield.focus({ preventScroll: true });
  }

  /** closes MathLive's suggestion list; false when none was open */
  closeSuggestions(): boolean {
    if (!isSuggestionPopoverVisible()) return false;
    hideSuggestionPopover(this._mathfield);
    return true;
  }

  onKeystroke(event: KeyboardEvent): boolean {
    return this._mathfield.onKeystroke(event);
  }

  onInput(text: string): void {
    this._mathfield.onInput(text);
  }

  onCompositionStart(composition: string): void {
    this._mathfield.onCompositionStart(composition);
  }

  onCompositionUpdate(composition: string): void {
    this._mathfield.onCompositionUpdate(composition);
  }

  onCompositionEnd(composition: string): void {
    this._mathfield.onCompositionEnd(composition);
  }

  onCut(event: ClipboardEvent): boolean {
    this._mathfield.onCut(event);
    return true;
  }

  onCopy(event: ClipboardEvent): void {
    this._mathfield.onCopy(event);
  }

  onPaste(event: ClipboardEvent): boolean {
    return this._mathfield.onPaste(event);
  }

  onFocus(): void {
    this._mathfield.onFocus();
  }

  onBlur(): void {
    this._mathfield.onBlur();
  }

  dispose(): void {
    this._mathfield.dispose();
  }
}
