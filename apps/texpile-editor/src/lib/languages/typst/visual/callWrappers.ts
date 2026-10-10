// functions a snippet file names as wrappers: a call to one is formatted text in the visual editor,
// tagged with its name, rather than a raw chip. nothing is guessed from #let: the list is the file's
let names: ReadonlySet<string> = new Set();

/** false when the names are the ones already in force */
export function setCallWrappers(next: Iterable<string>): boolean {
	const set = new Set(next);
	if (set.size === names.size && [...set].every((n) => names.has(n))) return false;
	names = set;
	return true;
}

export function isCallWrapper(name: string): boolean {
	return names.has(name);
}
