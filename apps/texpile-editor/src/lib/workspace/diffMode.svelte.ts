// Diff mode: a read-only third view showing the committed HEAD against the working copy.
// It is snapshotted imperatively (on entry, file switch, manual refresh) and deliberately NOT
// driven by an $effect, so it can never become reactive on the source text and re-diff on every
// keystroke. The layout choice persists; the mode itself does not, so a reload always restores
// the last visual/source choice rather than dropping the user back into a diff.
import { browser } from '$lib/runtime';
import { gitShowHead } from '$lib/workspace/git';
import { m } from '$lib/paraglide/messages';

const LAYOUT_KEY = 'texpile:diffLayout';

export interface DiffDeps {
	getLoadedPath(): string | null;
	/** the working buffer to compare against HEAD (.tex uses the source text, others the raw text) */
	getWorkingText(): string;
}

export class DiffMode {
	/** HEAD content ('' when the file has no committed baseline) */
	original = $state('');
	/** the working buffer at snapshot time */
	modified = $state('');
	loading = $state(false);
	error = $state<string | null>(null);
	hasHead = $state(true);
	layout = $state<'unified' | 'split'>('unified');

	constructor(private deps: DiffDeps) {}

	/** restore the persisted layout; call once at mount */
	restoreLayout() {
		if (browser && localStorage.getItem(LAYOUT_KEY) === 'split') this.layout = 'split';
	}

	toggleLayout() {
		this.layout = this.layout === 'unified' ? 'split' : 'unified';
		if (browser) localStorage.setItem(LAYOUT_KEY, this.layout);
	}

	async snapshot(): Promise<void> {
		const path = this.deps.getLoadedPath();
		if (!path) return;
		this.modified = this.deps.getWorkingText();
		this.loading = true;
		this.error = null;
		const res = await gitShowHead(path);
		if (this.deps.getLoadedPath() !== path) return; // a file switch superseded this snapshot
		this.loading = false;
		if (!res.ok) {
			this.error = res.reason === 'no-git' ? m.wsview_diff_error_no_git() : (res.error ?? m.wsview_diff_error_default());
			this.original = '';
			this.hasHead = false;
			return;
		}
		this.hasHead = res.hasHead;
		this.original = res.content ?? '';
	}
}
