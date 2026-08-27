// The comparison a diff tab shows: one saved version against the working copy.
//
// Snapshotted on a change of COMPARISON (workspaceDoc's effect), on a file switch once the new
// buffer has loaded (FileOpener), and on manual refresh. Never on the source text: that would
// re-diff on every keystroke, so the snapshot deliberately reads the buffer untracked rather than
// depending on it.
//
// The layout choice persists; which comparison was open does not, so a reload restores the files
// you had rather than dropping you back into a diff.
import type { Node as PMNode } from 'prosemirror-model';
import { browser } from '$lib/runtime';
import { layout, updateLayout } from '$lib/storage/layout';
import { gitShowHead, gitShowAt } from '$lib/workspace/git';
import { VisualParser } from '$lib/workspace/visualParse.svelte';
import { m } from '$lib/paraglide/messages';

export type DiffDeps = {
	getLoadedPath(): string | null;
	/** the working buffer to compare against HEAD (.tex uses the source text, others the raw text) */
	getWorkingText(): string;
	/** project macro definitions, so a version parses in the same context the live document did */
	getMacros(): string;
};

export class DiffMode {
	/** HEAD content ('' when the file has no committed baseline) */
	original = $state('');
	/** the working buffer at snapshot time */
	modified = $state('');
	loading = $state(false);
	error = $state<string | null>(null);
	hasHead = $state(true);
	layout = $state<'unified' | 'split'>('unified');
	/** which version the working copy is compared against; null means HEAD */
	compareRef = $state<{ hash: string; subject: string } | null>(null);

	// The visual diff compares two documents, so the version goes through the importer too. On
	// demand, not with every snapshot: a source comparison never needs it and this is the slow half.

	/** null until asked for, or if it would not parse */
	versionDoc = $state<PMNode | null>(null);
	/** outside the body, so its changes are invisible to a document diff */
	versionPreamble = $state<string | null>(null);
	versionUnavailable = $state(false);
	/** its own, not the editor's: progress and sequence numbers must not collide */
	private versionParser = new VisualParser(() => this.deps.getMacros());
	/** so asking twice costs one parse */
	private versionParsedFrom: string | null = null;

	constructor(private deps: DiffDeps) {}

	/** aim the next snapshot at a specific version (null returns it to HEAD). */
	setCompareRef(ref: { hash: string; subject: string } | null) {
		this.compareRef = ref;
	}

	/** restore the persisted layout; call once at mount */
	restoreLayout() {
		if (browser && layout.current.diffLayout === 'split') this.layout = 'split';
	}

	toggleLayout() {
		this.layout = this.layout === 'unified' ? 'split' : 'unified';
		if (browser) updateLayout({ diffLayout: this.layout });
	}

	async snapshot(): Promise<void> {
		const path = this.deps.getLoadedPath();
		if (!path) return;
		// Read now, publish at the end, TOGETHER with the version it is being compared against.
		// The panel rebuilds on either side changing, so publishing them apart had it diff this
		// file's working copy against the previous file's baseline, or against none at all - the
		// whole document reading as changed for the few frames before the other half landed.
		const working = this.deps.getWorkingText();
		this.loading = true;
		this.error = null;
		this.forgetVersionDoc(); // whatever it held describes the comparison being replaced
		const ref = this.compareRef;
		const res = ref ? await gitShowAt(path, ref.hash) : await gitShowHead(path);
		if (this.deps.getLoadedPath() !== path) return; // a file switch superseded this snapshot
		this.loading = false;
		if (!res.ok) {
			this.error = res.reason === 'no-git' ? m.wsview_diff_error_no_git() : (res.error ?? m.wsview_diff_error_default());
			this.original = '';
			this.modified = working;
			this.hasHead = false;
			return;
		}
		this.hasHead = res.hasHead;
		this.original = res.content ?? '';
		this.modified = working;
	}

	private forgetVersionDoc() {
		this.versionDoc = null;
		this.versionPreamble = null;
		this.versionUnavailable = false;
		this.versionParsedFrom = null;
	}

	/** once per version, safe to call repeatedly. A version that will not parse is not an error:
	 *  the source diff shows it, and the visual one says so and points there. */
	async ensureVersionDoc(format: 'tex' | 'md' | 'typ'): Promise<void> {
		const source = this.original;
		if (this.versionParsedFrom === source) return;
		this.versionParsedFrom = source;
		this.versionDoc = null;
		this.versionPreamble = null;
		this.versionUnavailable = false;
		// parsed rather than skipped: no committed baseline compares against an empty document, so
		// every block reads as new - the same thing the source diff shows
		const { parsed, failure } = await this.versionParser.parse(source, format);
		if (this.versionParsedFrom !== source) return; // a newer comparison owns this now
		if (failure || !parsed) {
			this.versionUnavailable = true;
			return;
		}
		this.versionDoc = parsed.doc;
		this.versionPreamble = parsed.preamble;
	}
}
