/**
 *
 * Importing this package in a web page will make the `<math-field>` custom
 * element available. Use it as a drop-in replacement for `<textarea>` or
 * `<input type="text">` to allow the user to type and edit mathematical
 * expressions.
 *
 *
 * @example
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/mathlive/mathlive.min.js"></script>
 *  <math-field>\frac{1}{2}</math-field>
 * <script>
 * const mf = document.querySelector('math-field');
 * mf.addEventListener('input', (ev) => {
 *  console.log('New value:', mf.value);
 * });
 * </script>
 * ```
 *
 * Alternatively, you can use the **unpkg** CDN to load the library
 *
 * ```html
 * <script src="https://unpkg.com/mathlive"></script>
 * ```
 *
 *
 * @packageDocumentation Mathfield API Reference
 * @version {{SDK_VERSION}}
 *
 */

import type { VirtualKeyboardInterface } from './virtual-keyboard';
import type { StaticRenderOptions } from './options';
import type { MathfieldElement } from './mathfield-element';
export { setKeyboardLayoutLocale, setKeyboardLayout } from './keyboard-layout';

export * from './commands';
export * from './core-types';
export * from './options';
export * from './mathfield';
export * from './mathfield-element';
export * from './mathlive-ssr';
export * from './virtual-keyboard';
export * from './math-static-elements';

export declare function renderMathInDocument(
  options?: StaticRenderOptions
): void;

export declare function renderMathInElement(
  element: string | HTMLElement,
  options?: StaticRenderOptions
): void;

export declare function initVirtualKeyboardInCurrentBrowsingContext(): void;

/**
 * How an operator places its scripts: as its command does, above and below
 * it, or beside it.
 */
export type MathfieldLimits = 'default' | 'over-under' | 'adjacent';

/**
 * What a menu of the page's own needs to know about the place in a field it
 * opens on.
 */
export type MathfieldContext = {
  /** the matrix, cases or lines the caret is in */
  array?: {
    environment: string;
    canAddRow: boolean;
    canRemoveRow: boolean;
    canAddColumn: boolean;
    canRemoveColumn: boolean;
  };
  /** the scripts of the operator at the caret, `\sum` or `\lim`; `setLimits` changes them */
  limits?: MathfieldLimits;
};

export declare function mathfieldContext(
  field: MathfieldElement
): MathfieldContext;

export declare const version: {
  mathlive: string;
};

declare global {
  interface Window {
    mathVirtualKeyboard: VirtualKeyboardInterface & EventTarget;
  }
}
