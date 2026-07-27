/** Trailing-edge debounce keeping only the latest value; for display-only recomputes that may
 * lag typing by a beat (word count, TOC, table watcher). */
export function trailingDebounce<T>(ms: number, fn: (value: T) => void): (value: T) => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (value: T) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(value), ms);
	};
}
