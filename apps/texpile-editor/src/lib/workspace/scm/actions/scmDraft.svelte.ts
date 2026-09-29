// What the author has chosen in the Source Control panel but not saved yet: the files they
// unticked, the build output they ticked, and the message they typed.
//
// This lived inside the panel, and the panel only exists while the sidebar shows it. Switching to
// the file tree and back therefore ticked everything again and emptied the message, so the next
// Save version quietly took in files the author had deliberately left out. Kept here, per folder.
// What is unstaged is also kept across restarts, as git's index keeps it for VS Code: a file left
// out to stay on this computer came back staged after a restart, and the next Commit & Sync pushed it.
import { isBuildArtifact } from '../../buildArtifacts';
import type { GitStatusEntry } from '../git';

/** build output and whole folders of new files start unticked: ticking one is an opt-in */
export function optIn(c: GitStatusEntry): boolean {
	return !!c.files || isBuildArtifact(c.path);
}

type Chosen = { excluded: string[]; artifactsOptedIn: string[] };

const KEY = 'texpile:scmDraft:';

function load(root: string | null): Chosen {
	try {
		const saved = root ? JSON.parse(localStorage.getItem(KEY + root) ?? 'null') : null;
		if (saved && Array.isArray(saved.excluded) && Array.isArray(saved.artifactsOptedIn)) return saved as Chosen;
	} catch {
		// unreadable or unavailable storage: start with everything staged, as before
	}
	return { excluded: [], artifactsOptedIn: [] };
}

export class ScmDraft {
	#excluded = $state<string[]>([]);
	#artifactsOptedIn = $state<string[]>([]);
	message = $state('');

	constructor(private root: string | null = null) {
		const chosen = load(root);
		this.#excluded = chosen.excluded;
		this.#artifactsOptedIn = chosen.artifactsOptedIn;
	}

	/** Paths the author has UNticked. Exclusions rather than inclusions, so a file that changes
	 *  while the panel is open joins the next version by default instead of being left out. */
	get excluded(): string[] {
		return this.#excluded;
	}
	set excluded(paths: string[]) {
		this.#excluded = paths;
		this.#save();
	}
	/** Build output starts unticked without being "excluded by the author": ticking one is
	 *  remembered rather than undone on the next scan. */
	get artifactsOptedIn(): string[] {
		return this.#artifactsOptedIn;
	}
	set artifactsOptedIn(paths: string[]) {
		this.#artifactsOptedIn = paths;
		this.#save();
	}

	#save(): void {
		if (!this.root) return;
		try {
			const chosen: Chosen = { excluded: this.#excluded, artifactsOptedIn: this.#artifactsOptedIn };
			if (!chosen.excluded.length && !chosen.artifactsOptedIn.length) localStorage.removeItem(KEY + this.root);
			else localStorage.setItem(KEY + this.root, JSON.stringify(chosen));
		} catch {
			// kept for this window only
		}
	}

	/** ticked in the panel. Commit & Sync and Commit & Checkout go by it too (scmSaveFirst.ts), so
	 *  a file unstaged to stay on this computer is not committed and pushed behind the author's back */
	ticked(c: GitStatusEntry): boolean {
		return optIn(c) ? this.artifactsOptedIn.includes(c.path) : !this.excluded.includes(c.path);
	}

	/** After a commit: the message is spent. What was left unstaged stays so, as in VS Code; given
	 *  the changes listed now, a file that has left the list is forgotten, and starts over when it
	 *  next changes. Emptying the exclusions here staged a private draft again for the next commit. */
	clear(listed?: string[]): void {
		this.message = '';
		if (!listed) return;
		this.excluded = this.excluded.filter((p) => listed.includes(p));
		this.artifactsOptedIn = this.artifactsOptedIn.filter((p) => listed.includes(p));
	}
}

const drafts = new Map<string, ScmDraft>();

/** the draft for one folder: what was unstaged there last time, and no message */
export function scmDraftFor(root: string): ScmDraft {
	let draft = drafts.get(root);
	if (!draft) {
		draft = new ScmDraft(root);
		drafts.set(root, draft);
	}
	return draft;
}
