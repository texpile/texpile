// A pane's props with some of them replaced, read through: each read still reaches only the one
// getter it names, so a pane that reads one prop is not redrawn when another changes
export function overlayProps<T extends object>(base: T, extra: Partial<T>): T {
	return new Proxy(base, {
		get: (target, key) => (key in extra ? Reflect.get(extra, key) : Reflect.get(target, key)),
		has: (target, key) => key in extra || key in target,
		ownKeys: (target) => [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(extra)])],
		getOwnPropertyDescriptor: (target, key) =>
			key in extra
				? { enumerable: true, configurable: true, get: () => Reflect.get(extra, key) }
				: Reflect.getOwnPropertyDescriptor(target, key)
	});
}
