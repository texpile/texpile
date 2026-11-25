// in dev and test builds the view plugins and app code hold throws on a member the canvas does not answer (2.3)

export class CanvasContractError extends Error {
	constructor(readonly member: string) {
		super(`the canvas view has no ${member}: port the caller to view.canvas (design section 2.4)`);
		this.name = 'CanvasContractError';
	}
}

/** read by promise resolution, test matchers and svelte's inspection, never by a plugin */
const PROBED = new Set(['then', 'toJSON', 'asymmetricMatch', '$$typeof', 'nodeType', 'constructor', 'toString']);

export function contractView<T extends object>(view: T): T {
	if (!import.meta.env?.DEV) return view;
	return new Proxy(view, {
		get(target, key) {
			if (typeof key === 'symbol' || key in target || PROBED.has(key)) return Reflect.get(target, key, target);
			throw new CanvasContractError(key);
		}
	});
}
