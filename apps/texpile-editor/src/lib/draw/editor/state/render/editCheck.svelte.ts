/** what TeX said, line by line, as a count of each first line */
function tally(errors: readonly string[]) {
	const counts = new Map<string, number>();
	for (const e of errors) {
		const line = e.replace(/^!\s*/, '').split('\n')[0];
		counts.set(line, (counts.get(line) ?? 0) + 1);
	}
	return counts;
}

/** the first error `after` has that `before` did not */
export function newError(before: readonly string[], after: readonly string[]) {
	const had = tally(before);
	for (const [line, n] of tally(after)) if (n > (had.get(line) ?? 0)) return line;
	return null;
}

/** canvas edits waiting for their drawing: the engine says whether each typesets, so nothing keeps a list of what
 *  each kind of picture takes */
export class EditCheck {
	/** what TeX said about the edit last taken back */
	refused = $state<string | null>(null);
	/** why an edit was not made, found before trying it */
	declined = $state<string | null>(null);
	#pending: { source: string; before: readonly string[]; steps: number } | null = null;
	/** the errors of the text as last drawn, not a preview of it */
	#settled: readonly string[] = [];

	/** an edit applied; `ownStep` when it is an undo step of its own */
	edited(source: string, ownStep: boolean) {
		this.refused = null;
		this.declined = null;
		const p = this.#pending;
		this.#pending = { source, before: p?.before ?? this.#settled, steps: (p?.steps ?? 0) + (ownStep || !p ? 1 : 0) };
	}

	decline(reason: string) {
		this.declined = reason;
	}

	/** the text changed some other way: what it draws is its own */
	letGo() {
		this.#pending = null;
	}

	/** a drawing in, of the text or a preview: the number of undo steps that take back the edits it broke, or 0 */
	drawn(source: string, text: string, errors: readonly string[] | null, failure: string | null) {
		const p = this.#pending;
		if (p?.source === source) {
			this.#pending = null;
			const broke = errors ? newError(p.before, errors) : failure;
			if (broke) {
				this.refused = broke;
				return p.steps;
			}
		}
		if (source === text && errors) this.#settled = errors;
		return 0;
	}
}
