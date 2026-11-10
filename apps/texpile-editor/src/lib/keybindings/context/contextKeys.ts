// context keys for when clauses: the window's, and those of each part of the page a key can be pressed in, found by
// walking up from the focused element as VS Code does with data-keybinding-context
import type { ContextReader, ContextValue } from '../when/whenExpression';

export type ContextSource = ContextValue | (() => ContextValue);

const ATTR = 'data-key-context';

export class ContextScope {
	private readonly values = new Map<string, ContextSource>();

	set(key: string, value: ContextSource): void {
		this.values.set(key, value);
	}

	setAll(values: Record<string, ContextSource>): void {
		for (const [key, value] of Object.entries(values)) this.values.set(key, value);
	}

	delete(key: string): void {
		this.values.delete(key);
	}

	has(key: string): boolean {
		return this.values.has(key);
	}

	get(key: string): ContextValue {
		const value = this.values.get(key);
		return typeof value === 'function' ? value() : value;
	}
}

export const windowContext = new ContextScope();

const scopes = new Map<string, ContextScope>();
let nextScope = 0;

export type ContextScopeHandle = { scope: ContextScope; dispose(): void };

/** keys pressed inside `node` read these values, over the ones of the parts around it */
export function contextScopeOn(node: HTMLElement, values: Record<string, ContextSource> = {}): ContextScopeHandle {
	const id = String(++nextScope);
	const scope = new ContextScope();
	scope.setAll(values);
	scopes.set(id, scope);
	node.setAttribute(ATTR, id);
	return {
		scope,
		dispose() {
			scopes.delete(id);
			if (node.getAttribute(ATTR) === id) node.removeAttribute(ATTR);
		}
	};
}

function elementOf(target: EventTarget | null): Element | null {
	if (!target || typeof (target as Node).nodeType !== 'number') return null;
	const node = target as Node;
	return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

/** keys every press has without a scope saying so */
function targetKeys(el: Element | null): Record<string, boolean> {
	return {
		inputFocus: !!el?.closest('input, textarea, select'),
		textInputFocus: !!el?.closest('input, textarea, select, [contenteditable="true"], .xterm'),
		terminalFocus: !!el?.closest('.xterm'),
		dialogFocus: !!el?.closest('[role="dialog"], [role="alertdialog"]')
	};
}

export function contextAt(target: EventTarget | null): ContextReader {
	const el = elementOf(target);
	const chain: ContextScope[] = [];
	for (let at = el?.closest(`[${ATTR}]`); at; at = at.parentElement?.closest(`[${ATTR}]`)) {
		const scope = scopes.get(at.getAttribute(ATTR) ?? '');
		if (scope) chain.push(scope);
	}
	const own = targetKeys(el);
	return (key) => {
		for (const scope of chain) if (scope.has(key)) return scope.get(key);
		if (key in own) return own[key];
		return windowContext.get(key);
	};
}
