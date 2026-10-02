import { eventLocation, keyboardModifiersFromEvent } from '../events/utils';
import { onLongPress } from '../events/longpress';

import { Menu } from './menu';

/**
 * Return `true` if the context menu was triggered by the event.
 *
 * The function is asynchronous because it may need to wait for a long press
 * to complete.
 *
 * @param event
 * @param target
 * @param menu
 * @returns
 */
export async function onContextMenu(
  event: Event,
  target: Element,
  menu: Menu
): Promise<boolean> {
  // the field's own pointer handling cancels every pointerdown, which left a long press no menu
  if (event.defaultPrevented && event.type !== 'pointerdown') return false;
  //
  // The context menu gesture (right-click, control-click, etc..)
  // may have been triggered
  //
  if (event.type === 'contextmenu') {
    const evt = event as MouseEvent;
    // Prevent default before showing menu to avoid focus loss
    event.preventDefault();
    event.stopPropagation();
    if (
      menu.show({
        target,
        location: eventLocation(evt),
        modifiers: keyboardModifiersFromEvent(evt),
      })
    )
      return true;
  }

  //
  // The context menu keyboard shortcut (shift+F10) was triggered
  //
  if (event.type === 'keydown') {
    const evt = event as KeyboardEvent;
    if (evt.code === 'ContextMenu' || (evt.code === 'F10' && evt.shiftKey)) {
      // Shift+F10 = context menu
      // Get the center of the parent
      const bounds = target?.getBoundingClientRect();
      if (
        bounds &&
        acceptContextMenu(target, {
          x: Math.ceil(bounds.left + bounds.width / 2),
          y: Math.ceil(bounds.top + bounds.height / 2),
        }) &&
        menu.show({
          target: target,
          location: {
            x: Math.ceil(bounds.left + bounds.width / 2),
            y: Math.ceil(bounds.top + bounds.height / 2),
          },
          modifiers: keyboardModifiersFromEvent(evt),
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }
  }

  //
  // This might be a long press...
  //
  if (
    event.type === 'pointerdown' &&
    (event as PointerEvent).pointerType !== 'mouse' &&
    (event as PointerEvent).button === 0
  ) {
    // Are we inside the target element?
    let eventTarget = event.target as HTMLElement;
    while (eventTarget && target !== eventTarget)
      eventTarget = eventTarget.parentNode as HTMLElement;
    if (!eventTarget) return false;

    // If no items visible, don't show anything
    if (!menu.visible) return false;

    const location = eventLocation(event);
    if (await onLongPress(event)) {
      if (menu.state !== 'closed') return false;
      if (!acceptContextMenu(target, location)) return false;
      menu.show({ target, location });
      return true;
    }
  }

  return false;
}

/** asks the page first: it cancels the `contextmenu` on the field's element to show a menu of its own */
export function acceptContextMenu(
  target: Element,
  location: { x: number; y: number } | undefined
): boolean {
  const root = target.getRootNode();
  const host = root instanceof ShadowRoot ? root.host : target;
  return host.dispatchEvent(
    new MouseEvent('contextmenu', {
      cancelable: true,
      bubbles: true,
      composed: true,
      clientX: location?.x ?? 0,
      clientY: location?.y ?? 0,
    })
  );
}
