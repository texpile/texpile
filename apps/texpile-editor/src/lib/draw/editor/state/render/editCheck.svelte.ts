function tally(errors: readonly string[]) {
	const counts = new Map<string, number>();
	for (const e of errors) {
		const line = e.replace(/^!\s*/, '').split('\n')[0];
		counts.set(line, (counts.get(line) ?? 0) + 1);
	}
	return counts;
}

export function newError(before: readonly string[], after: readonly string[]) {
	const had = tally(before);
	for (const [line, n] of tally(after)) if (n > (had.get(line) ?? 0)) return line;
	return null;
}

export class EditCheck {
	refused = $state<string | null>(null);
	declined = $state<string | null>(null);
	#pending: { source: string; before: readonly string[]; steps: number } | null = null;
	#settled: readonly string[] = [];

	edited(source: string, ownStep: boolean) {
		this.refused = null;
		this.declined = null;
		const p = this.#pending;
		this.#pending = { source, before: p?.before ?? this.#settled, steps: (p?.steps ?? 0) + (ownStep || !p ? 1 : 0) };
	}

	decline(reason: string) {
		this.declined = reason;
	}

	letGo() {
		this.#pending = null;
	}

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
