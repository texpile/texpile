// Builds and releases the live MathfieldElement a math node view swaps in for its static
// placeholder once the node nears the viewport.
import { MathfieldElement } from 'mathlive';

export type FieldListeners = {
	input: () => void;
	moveOut: (e: CustomEvent<{ direction: string }>) => void;
	focus: () => void;
	blur: () => void;
	keydown: (e: KeyboardEvent) => void;
};

export function buildMathField(
	latex: string,
	editable: boolean,
	listeners: FieldListeners
): { field: MathfieldElement; origFocus: (options?: FocusOptions) => void } {
	const field = new MathfieldElement();
	// The document's own macros are NOT applied here: reading field.macros throws "Mathfield not
	// mounted" until the element is in the document, and this one is built detached. The node view
	// applies them once it has inserted the field.
	field.mathVirtualKeyboardPolicy = 'manual';
	field.style.border = 'none';
	field.style.outline = 'none';
	field.style.backgroundColor = 'transparent';
	// highlight when the cursor is inside the field
	field.style.setProperty('--contains-highlight-background-color', 'hsla(210, 100%, 85%, 0.4)');

	field.setValue(latex, { format: 'latex-expanded' });

	field.addEventListener('input', listeners.input);
	field.addEventListener('move-out', listeners.moveOut as EventListener);
	field.addEventListener('focus', listeners.focus);
	field.addEventListener('blur', listeners.blur);
	field.addEventListener('keydown', listeners.keydown);

	// mathlive doesn't fire focus events on programmatic .focus(), so wrap it
	const origFocus = field.focus.bind(field) as (options?: FocusOptions) => void;
	field.focus = ((options?: FocusOptions) => {
		origFocus(options);
		listeners.focus();
		// bubbling event for global listeners like the toolbar
		field.dispatchEvent(new CustomEvent('ml:focusin', { bubbles: true, cancelable: true }));
	}) as typeof field.focus;

	// undo/redo handled by prosemirror
	field.canUndo = () => false;
	field.canRedo = () => false;

	if (!editable) {
		field.readOnly = true;
	}

	return { field, origFocus };
}

export function releaseMathField(
	field: MathfieldElement,
	origFocus: ((options?: FocusOptions) => void) | undefined,
	listeners: FieldListeners
): void {
	field.removeEventListener('input', listeners.input);
	field.removeEventListener('move-out', listeners.moveOut as EventListener);
	field.removeEventListener('focus', listeners.focus);
	field.removeEventListener('blur', listeners.blur);
	field.removeEventListener('keydown', listeners.keydown);
	if (origFocus) {
		// eslint-disable-next-line no-param-reassign -- restoring the focus method the build wrapped
		field.focus = origFocus as typeof field.focus;
	}
}
