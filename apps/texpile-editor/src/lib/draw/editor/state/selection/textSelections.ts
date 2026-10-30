const KEPT = 200;

/** the selection each text of the history had, by the text itself */
export class TextSelections {
	#by = new Map<string, { ids: number[]; primary: number }>();

	remember(text: string, ids: number[], primary: number) {
		this.#by.delete(text);
		this.#by.set(text, { ids, primary });
		if (this.#by.size > KEPT) this.#by.delete(this.#by.keys().next().value!);
	}

	of(text: string) {
		return this.#by.get(text) ?? null;
	}
}
