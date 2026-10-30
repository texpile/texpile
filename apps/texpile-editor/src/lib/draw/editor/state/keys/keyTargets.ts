// a widget that moves or activates with these keys keeps them
const ARROW_WIDGETS = '[role=slider], [role=tab], [role=menuitem], [role=option], [role=treeitem], [role=radio], [role=spinbutton], select';

export function typing(target: EventTarget | null) {
	const el = target as HTMLElement | null;
	return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable || !!el.closest('.cm-editor'));
}

/** Enter and Space press a focused button, the arrows move in a list or a slider */
export function isWidgetKey(e: KeyboardEvent) {
	const el = e.target instanceof Element ? e.target : null;
	if (!el) return false;
	if (e.key === 'Enter' || e.key === ' ') return !!el.closest('button, a, [role=button], ' + ARROW_WIDGETS);
	return e.key.startsWith('Arrow') && !!el.closest(ARROW_WIDGETS);
}

/** the focus is the editor's, or nobody's */
export function isEditorFocused(root: Element | undefined) {
	const el = document.activeElement;
	return !!root && (!el || el === document.body || root.contains(el)) && !typing(el);
}
