import { untrack } from 'svelte';

/** a module-level $state behind a stable { current } accessor, usable from plain .ts modules */
export type Box<T> = {
	current: T;
};

/** reassigning .current signals, mutating the held value does not; assigning the same object or function again
 *  signals too, as the writable it replaced did */
export function box<T>(initial: T): Box<T> {
	let value = $state.raw(initial);
	let pokes = $state(0);
	return {
		get current(): T {
			void pokes;
			return value;
		},
		set current(next: T) {
			// untracked, or an effect that assigns the same object twice would depend on this box and re-run forever
			untrack(() => {
				if (next === value && ((typeof next === 'object' && next !== null) || typeof next === 'function')) pokes += 1;
				value = next;
			});
		}
	};
}
