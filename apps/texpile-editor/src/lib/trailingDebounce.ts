export interface Debounced<T> {
	(value: T): void;
	/** drop any pending fire: a stale timer outliving its editor must not clobber shared stores. */
	cancel(): void;
}

/** Trailing-edge debounce keeping only the latest value; for display-only recomputes that may
 * lag typing by a beat (word count, TOC, table watcher). Cancel on teardown. */
export function trailingDebounce<T>(ms: number, fn: (value: T) => void): Debounced<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const debounced = (value: T) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(value), ms);
	};
	debounced.cancel = () => clearTimeout(timer);
	return debounced;
}
