class PrefsFocus {
	/** the package file lists under Completion are showing */
	packagesOpen = $state(false);
	/** the row just chosen from search */
	row = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	flash(id: string): void {
		clearTimeout(this.#timer);
		this.row = id;
		this.#timer = setTimeout(() => (this.row = null), 1800);
	}
}

export const prefsFocus = new PrefsFocus();
