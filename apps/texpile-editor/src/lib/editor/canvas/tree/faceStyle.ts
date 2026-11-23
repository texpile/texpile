// the inline style, class list and dataset of a FaceElement, with the DOM's names and string forms
import type { StyleLook } from '../contracts/styleTypes';

type StyleMethods = {
	cssText: string;
	readonly length: number;
	setProperty(name: string, value: string | null, priority?: string): void;
	removeProperty(name: string): string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
};
type CamelStyleProperties = {
	[K in keyof CSSStyleDeclaration as CSSStyleDeclaration[K] extends string ? (K extends string ? K : never) : never]: string;
};
/** setProperty, removeProperty, getPropertyValue, cssText and camelCase property access (width, gridColumn ...) */
export type FaceInlineStyle = StyleMethods & Omit<CamelStyleProperties, keyof StyleMethods>;

function kebabOf(property: string): string {
	if (property.startsWith('--')) return property;
	if (property === 'cssFloat') return 'float';
	const kebab = property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
	return /^(webkit|moz|ms)-/.test(kebab) ? `-${kebab}` : kebab;
}

/** splits a declaration list at the semicolons outside parentheses and quotes */
export function declarationsOf(css: string): [string, string, string][] {
	const parts: string[] = [];
	let depth = 0;
	let quote = '';
	let start = 0;
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (quote) quote = c === quote ? '' : quote;
		else if (c === '"' || c === "'") quote = c;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ';' && depth === 0) {
			parts.push(css.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(css.slice(start));
	return parts.flatMap((part) => {
		const colon = part.indexOf(':');
		if (colon < 0) return [];
		const name = part.slice(0, colon).trim();
		let value = part.slice(colon + 1).trim();
		const important = /\s*!important$/i.exec(value);
		if (important) value = value.slice(0, important.index);
		return name && value ? [[name.startsWith('--') ? name : name.toLowerCase(), value, important ? 'important' : '']] : [];
	});
}

export class FaceStyleDeclaration implements StyleMethods {
	private readonly values = new Map<string, { value: string; priority: string }>();

	private text: string | null = null;

	constructor(private readonly onChange: () => void) {}

	get length(): number {
		return this.values.size;
	}

	get cssText(): string {
		return (this.text ??= [...this.values]
			.map(([name, { value, priority }]) => `${name}: ${value}${priority ? ' !important' : ''};`)
			.join(' '));
	}

	set cssText(css: string) {
		this.values.clear();
		for (const [name, value, priority] of declarationsOf(css)) this.values.set(name, { value, priority });
		this.changed();
	}

	private changed(): void {
		this.text = null;
		this.onChange();
	}

	setProperty(name: string, value: string | null, priority = ''): void {
		if (value === null || value === '') {
			this.removeProperty(name);
			return;
		}
		this.values.set(kebabOf(name), { value: String(value), priority });
		this.changed();
	}

	removeProperty(name: string): string {
		const key = kebabOf(name);
		const old = this.values.get(key)?.value ?? '';
		if (this.values.delete(key)) this.changed();
		return old;
	}

	getPropertyValue(name: string): string {
		return this.values.get(kebabOf(name))?.value ?? '';
	}

	getPropertyPriority(name: string): string {
		return this.values.get(kebabOf(name))?.priority ?? '';
	}
}

export function createFaceStyle(changed: () => void): FaceInlineStyle {
	const declaration = new FaceStyleDeclaration(changed);
	return new Proxy(declaration, {
		get(target, property, receiver) {
			if (typeof property !== 'string' || property in target) return Reflect.get(target, property, receiver);
			return target.getPropertyValue(property);
		},
		set(target, property, value, receiver) {
			if (typeof property !== 'string' || property in target) return Reflect.set(target, property, value, receiver);
			target.setProperty(property, value === null || value === undefined ? null : String(value));
			return true;
		}
	}) as unknown as FaceInlineStyle;
}

export function setLook(el: { readonly style: FaceInlineStyle }, look: StyleLook): void {
	Object.assign(el.style, look);
}

/** a class list over the owner's class attribute */
export class FaceClassList {
	constructor(
		private readonly read: () => string,
		private readonly write: (value: string) => void
	) {}

	private names(): string[] {
		return this.read().split(/\s+/).filter(Boolean);
	}

	get length(): number {
		return this.names().length;
	}

	get value(): string {
		return this.read();
	}

	add(...names: string[]): void {
		const current = this.names();
		const added = names.filter((name) => !current.includes(name));
		if (added.length) this.write([...current, ...added].join(' '));
	}

	remove(...names: string[]): void {
		const current = this.names();
		if (current.some((name) => names.includes(name))) this.write(current.filter((name) => !names.includes(name)).join(' '));
	}

	toggle(name: string, on?: boolean): boolean {
		const has = this.contains(name);
		const want = on ?? !has;
		if (want && !has) this.add(name);
		if (!want && has) this.remove(name);
		return want;
	}

	replace(from: string, to: string): boolean {
		const current = this.names();
		if (!current.includes(from)) return false;
		this.write([...new Set(current.map((name) => (name === from ? to : name)))].join(' '));
		return true;
	}

	contains(name: string): boolean {
		return this.names().includes(name);
	}

	item(index: number): string | null {
		return this.names()[index] ?? null;
	}

	[Symbol.iterator](): Iterator<string> {
		return this.names()[Symbol.iterator]();
	}
}

/** data-* attributes under their camelCase names */
export function createDataset(attributes: {
	get(name: string): string | null;
	set(name: string, value: string): void;
	remove(name: string): void;
	names(): string[];
}): Record<string, string | undefined> {
	function attributeOf(key: string): string {
		return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
	}
	function keyOf(name: string): string {
		return name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
	}
	return new Proxy({} as Record<string, string | undefined>, {
		get: (_target, key) => (typeof key === 'string' ? (attributes.get(attributeOf(key)) ?? undefined) : undefined),
		set(_target, key, value) {
			if (typeof key === 'string') attributes.set(attributeOf(key), String(value));
			return true;
		},
		deleteProperty(_target, key) {
			if (typeof key === 'string') attributes.remove(attributeOf(key));
			return true;
		},
		has: (_target, key) => typeof key === 'string' && attributes.get(attributeOf(key)) !== null,
		ownKeys: () =>
			attributes
				.names()
				.filter((name) => name.startsWith('data-'))
				.map(keyOf),
		getOwnPropertyDescriptor(_target, key) {
			const value = typeof key === 'string' ? attributes.get(attributeOf(key)) : null;
			return value === null ? undefined : { value, writable: true, enumerable: true, configurable: true };
		}
	});
}
