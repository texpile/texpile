// the open file's spelling and grammar rows, kept current as it is typed
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import { onReviewKept } from '$lib/editor/spellcheck/review/reviewStore';
import { editorConfigStore } from '$lib/stores/editorStore';
import type { Problem } from '../problemTypes';

export type OpenFile = { path: string; text: string };

/** the rows with the file and text they were found in */
export const openFileProofread = box<{ path: string; text: string; problems: Problem[] } | null>(null);

function spellcheckOn(): boolean {
	return editorConfigStore.current?.spellcheck ?? false;
}

export class OpenFileProofread {
	private gen = 0;
	private soon = trailingDebounce<void>(700, () => void this.run());
	private stopRules = onLintRulesChanged(() => this.soon());
	private stopReviews = onReviewKept(() => this.soon());

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
		if (!open || !spellcheckOn()) {
			openFileProofread.current = null;
			return;
		}
		const found = await this.check(open.path, open.text, () => my !== this.gen);
		if (my !== this.gen) return;
		openFileProofread.current = found ? { ...open, problems: found } : null;
	}

	destroy(): void {
		this.gen++;
		this.soon.cancel();
		this.stopRules();
		this.stopReviews();
		openFileProofread.current = null;
	}
}
