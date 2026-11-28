// the open file's own rows (notes, spelling, grammar), kept current as it is typed
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import { onReviewKept } from '$lib/editor/spellcheck/review/reviewStore';
import { ReviewRefresh } from '../reviewRefresh';
import type { Problem } from '../problemTypes';

export type OpenFile = { path: string; text: string };

/** the rows with the file and text they were found in */
export const openFileChecks = box<{ path: string; text: string; problems: Problem[] } | null>(null);

export class OpenFileChecks {
	private gen = 0;
	private reviews = new ReviewRefresh(700, () => this.run());
	private soon = trailingDebounce<void>(700, () => void this.reviews.run());
	private stopRules = onLintRulesChanged(() => this.soon());
	private stopReviews = onReviewKept(this.reviews.landed);

	constructor(
		private open: () => OpenFile | null,
		private check: (path: string, text: string, isStale: () => boolean) => Promise<Problem[] | null>
	) {}

	schedule(): void {
		this.soon();
	}

	private async run(): Promise<void> {
		const my = ++this.gen;
		const open = this.open();
		if (!open) {
			openFileChecks.current = null;
			return;
		}
		const found = await this.check(open.path, open.text, () => my !== this.gen);
		if (my !== this.gen) return;
		openFileChecks.current = found ? { ...open, problems: found } : null;
	}

	destroy(): void {
		this.gen++;
		this.soon.cancel();
		this.reviews.cancel();
		this.stopRules();
		this.stopReviews();
		openFileChecks.current = null;
	}
}
