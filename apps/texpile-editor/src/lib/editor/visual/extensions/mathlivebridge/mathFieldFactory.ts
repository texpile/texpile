// Builds and releases the live MathfieldElement a math node view swaps in for its static
// placeholder once the node nears the viewport.
import { MathfieldElement } from 'mathlive';
import type { Node } from 'prosemirror-model';
import { isMac } from '$lib/platform';
import { themeColorMap } from './themeBlack';
import { mathSearchKeydown } from './mathSearch/mathSearchKeys';

/** what a math node holds: LaTeX in a .tex or .md file, Typst in a .typ one */
export type MathSyntax = 'latex' | 'typst';

/** a math node's syntax, which its schema states on the node type */
export function mathSyntaxOf(node: Node): MathSyntax {
	return node.type.spec.mathSyntax === 'typst' ? 'typst' : 'latex';
}

/** the format a field reads and writes its node's content in */
export function mathFormat(syntax: MathSyntax): 'latex-expanded' | 'typst' {
	return syntax === 'typst' ? 'typst' : 'latex-expanded';
}

export type FieldListeners = {
	input: () => void;
	moveOut: (e: CustomEvent<{ direction: string }>) => void;
	focus: () => void;
	blur: () => void;
	keydown: (e: KeyboardEvent) => void;
	/** every way of asking for the field's menu: right-click, its menu button, a long press */
	menu: (e: MouseEvent) => void;
};

export function buildMathField(
	content: string,
	editable: boolean,
	listeners: FieldListeners,
	syntax: MathSyntax
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
	field.colorMap = themeColorMap;
	field.syntax = syntax;

	field.setValue(content, { format: mathFormat(syntax) });

	field.addEventListener('input', listeners.input);
	field.addEventListener('move-out', listeners.moveOut as EventListener);
	field.addEventListener('focus', listeners.focus);
	field.addEventListener('blur', listeners.blur);
	field.addEventListener('keydown', listeners.keydown);
	// capture: ahead of mathlive, which shows its own menu unless this one cancels the event
	field.addEventListener('contextmenu', listeners.menu, { capture: true });
	// capture: mathlive stops the Space that completes a \command
	field.addEventListener('keydown', completeWithPlaceholder, { capture: true });
	field.addEventListener('keydown', mathSearchKeydown, { capture: true });

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

// hotfix for https://github.com/arnog/mathlive/issues/3066
export function dropIntlBackslashBinding(field: MathfieldElement): void {
	if (!isMac || !field.isConnected) return;
	const kept = field.keybindings.filter((binding) => binding.key !== '[IntlBackslash]');
	// eslint-disable-next-line no-param-reassign
	if (kept.length !== field.keybindings.length) field.keybindings = kept;
}

// hotfix for https://github.com/arnog/mathlive/issues/3084
function completeWithPlaceholder(event: KeyboardEvent): void {
	const field = event.currentTarget as MathfieldElement;
	if (
		field.mode !== 'latex' ||
		field.syntax === 'typst' ||
		(event.key !== ' ' && event.key !== 'Enter') ||
		event.shiftKey ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	)
		return;
	event.preventDefault();
	event.stopPropagation();
	field.executeCommand(['complete', 'accept-all'] as never);
	const at = field.position;
	const latex = field.getValue(at - 1, at);
	if (!/^\\(?!placeholder\b|operatorname\b)[a-zA-Z]+(\{\})+$/.test(latex)) return;
	// one offset per empty argument; walking back while getValue matches strays into a box before it (y^2\hat)
	const emptyArgs = latex.split('{}').length - 1;
	field.selection = { ranges: [[at - 1 - emptyArgs, at]] };
	field.insert(latex.replace(/\{\}/g, '{#?}'), { selectionMode: 'placeholder' });
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
	field.removeEventListener('contextmenu', listeners.menu, { capture: true });
	field.removeEventListener('keydown', completeWithPlaceholder, { capture: true });
	field.removeEventListener('keydown', mathSearchKeydown, { capture: true });
	if (origFocus) {
		// eslint-disable-next-line no-param-reassign -- restoring the focus method the build wrapped
		field.focus = origFocus as typeof field.focus;
	}
}
