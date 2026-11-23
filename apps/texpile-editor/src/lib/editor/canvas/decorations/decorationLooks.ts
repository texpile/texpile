// inline decorations draw through the look their producer gives (spec.canvasLook) or one registered for a class a
// third-party producer writes; a class with no look draws nothing
import type { InlineDecorationView } from '../contracts/decorationTypes';
import type { DecorationLook } from '../contracts/styleTypes';

const registered = new Map<string, DecorationLook>();
const byPrefix = new Map<string, DecorationLook>();
const reported = new Set<string>();

export function registerDecorationLook(className: string, look: DecorationLook): void {
	registered.set(className, look);
}

/** the look of every class with this prefix that has none of its own (a producer that names its classes by kind) */
export function registerDecorationLookPrefix(prefix: string, look: DecorationLook): void {
	byPrefix.set(prefix, look);
}

function specLook(spec: unknown): DecorationLook | null {
	return spec && typeof spec === 'object' && 'canvasLook' in spec ? ((spec as { canvasLook: DecorationLook }).canvasLook ?? null) : null;
}

export function decorationLookOf(decoration: Pick<InlineDecorationView, 'classes' | 'spec'>): DecorationLook | null {
	const own = specLook(decoration.spec);
	if (own) return own;
	for (const name of decoration.classes) {
		const look = registered.get(name);
		if (look) return look;
	}
	for (const name of decoration.classes) for (const [prefix, look] of byPrefix) if (name.startsWith(prefix)) return look;
	if (import.meta.env?.DEV && decoration.classes.length) {
		const key = decoration.classes.join(' ');
		if (!reported.has(key)) {
			reported.add(key);
			console.debug(`canvas: no look for the decoration class ${key}`);
		}
	}
	return null;
}
