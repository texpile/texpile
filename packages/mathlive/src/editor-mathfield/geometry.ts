// Texpile: where an editing render stands on screen, in client px. A custom element answers from its shadow DOM; a
// headless field (a canvas) answers from its layout, so hit testing, vertical moves and the popover read no DOM.
import type { Atom } from '../core/atom-class';
import type {
  MathCaretPoint as CaretPoint,
  MathFieldRect as Rect,
  MathGeometry,
} from '../public/headless-mathfield';
import type { _Mathfield } from './mathfield-private';

export type {
  MathFieldRect as Rect,
  MathCaretPoint as CaretPoint,
  MathGeometry,
} from '../public/headless-mathfield';

function rectOf(r: DOMRect): Rect {
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

function findElementWithCaret(element: Element): Element | null {
  return (
    element.querySelector('.ML__caret') ??
    element.querySelector('.ML__text-caret') ??
    element.querySelector('.ML__latex-caret')
  );
}

/** the caret element's right edge and bottom, the way getCaretPoint read them */
export function domCaretPoint(element: Element): CaretPoint | null {
  const caret = findElementWithCaret(element);
  if (!caret) return null;
  const bounds = caret.getBoundingClientRect();
  return { x: bounds.right, y: bounds.bottom, height: bounds.height };
}

function getNodeBounds(node: Element): Rect {
  let target: Element = node;
  let bounds = target.getBoundingClientRect();

  // If the node has no height (for example an empty cell), walk up the DOM
  // tree to find an ancestor that contributes layout so we can anchor the
  // selection highlight to the line box rather than collapsing to the origin.
  while (
    bounds.bottom === bounds.top &&
    target.parentElement instanceof Element
  ) {
    target = target.parentElement;
    bounds = target.getBoundingClientRect();
    if (bounds.bottom !== bounds.top) break;
  }

  const styles = getComputedStyle(target as Element);
  const marginRight = parseInt(styles.marginRight);
  let width = bounds.right - bounds.left;
  let height = bounds.bottom - bounds.top;

  if (width === 0 || !Number.isFinite(width)) {
    const computedWidth = parseFloat(styles.width);
    if (Number.isFinite(computedWidth) && computedWidth > 0)
      width = computedWidth;
    else if (target instanceof HTMLElement && target.offsetWidth > 0)
      width = target.offsetWidth;
  }

  if (height === 0 || !Number.isFinite(height)) {
    const computedHeight = parseFloat(styles.height);
    if (Number.isFinite(computedHeight) && computedHeight > 0)
      height = computedHeight;
    else if (target instanceof HTMLElement && target.offsetHeight > 0)
      height = target.offsetHeight;
  }

  const result: Rect = {
    top: bounds.top - 1,
    bottom: bounds.top - 1 + height,
    left: bounds.left,
    right: bounds.left + width - 1 + marginRight,
  };
  if (node.children.length === 0 || node.tagName.toUpperCase() === 'SVG')
    return result;

  for (const child of node.children) {
    if (
      child.nodeType === 1 &&
      'atomId' in (child as HTMLElement).dataset &&
      !child.classList.contains('ML__pstrut')
    ) {
      const r: Rect = getNodeBounds(child);
      result.left = Math.min(result.left, r.left);
      result.right = Math.max(result.right, r.right);
      result.top = Math.min(result.top, r.top);
      result.bottom = Math.max(result.bottom, r.bottom);
    }
  }

  return result;
}

function domAtomRect(field: HTMLElement, id: string): Rect | null {
  const nodeList = Array.from(
    field.querySelectorAll(`[data-atom-id="${id}"]`)
  );
  let result: Rect | null = null;
  const grow = (bounds: Rect) => {
    if (!result) result = bounds;
    else {
      result.left = Math.min(result.left, bounds.left);
      result.right = Math.max(result.right, bounds.right);
      result.top = Math.min(result.top, bounds.top);
      result.bottom = Math.max(result.bottom, bounds.bottom);
    }
  };

  // For prompts, explicitly find and measure the overlay box (.ML__prompt)
  // to ensure its full bounds (including padding) are included
  {
    for (const node of nodeList) {
      if (!node.classList.contains('ML__prompt-atom')) continue;
      const overlay = node.querySelector('.ML__prompt');
      if (overlay) grow(getNodeBounds(overlay as HTMLElement));
    }
  }
  for (const node of nodeList) grow(getNodeBounds(node as HTMLElement));
  return result;
}

/** Calculates a DOMRect like getBoundingClientRect but excluding any CSS transforms */
export function getLocalDOMRect(el: HTMLElement): DOMRect {
  let offsetTop = 0;
  let offsetLeft = 0;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  while (el instanceof HTMLElement) {
    offsetTop += el.offsetTop;
    offsetLeft += el.offsetLeft;
    el = el.offsetParent as HTMLElement;
  }

  return new DOMRect(offsetLeft, offsetTop, width, height);
}

/** the id a vertical move measures an atom by: its own, or its first child's */
export function boxIdOf(atom: Atom): string | undefined {
  let target = atom;
  while (!target.id && target.hasChildren) target = atom.children[0];
  return target.id;
}

/** the custom element's answers, read from its shadow DOM */
export function domMathGeometry(mf: _Mathfield): MathGeometry {
  return {
    atomRect: (id) => domAtomRect(mf.field, id),
    atomOffsetRect: (id) => {
      const el = mf.field.querySelector<HTMLElement>(`[data-atom-id="${id}"]`);
      return el ? rectOf(getLocalDOMRect(el)) : null;
    },
    caretPoint: () => domCaretPoint(mf.field),
    contentRect: () =>
      rectOf(mf.field.querySelector('.ML__latex')!.getBoundingClientRect()),
    fieldRect: () => rectOf(mf.field.getBoundingClientRect()),
    hostRect: () =>
      rectOf(
        (mf.container ?? mf.element ?? mf.field).getBoundingClientRect()
      ),
    get scale() {
      const scale =
        Math.floor(mf.field.getBoundingClientRect().width) /
        mf.field.offsetWidth;
      return isNaN(scale) ? 1 : scale;
    },
    get scrollX() {
      return mf.field.scrollLeft;
    },
    scrollBy: (dx) =>
      mf.field.scroll({ top: 0, left: mf.field.scrollLeft + dx }),
  };
}
