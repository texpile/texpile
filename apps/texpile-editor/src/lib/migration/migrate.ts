// One-time migration of everything a pre-restructure install left behind, into the versioned
// stores (texpile:workspaces / texpile:layout / texpile:users, each { v: 1 }).
//
// The input this must accept is defined by RELEASE 0.16.1 - the last thing users actually have -
// plus the unreleased dev shapes that existed between it and the restructure. 0.16.1's surface,
// read from the tag:
//
//   localStorage: texpile:mainFiles / lastFiles / compileCommands / compileOutputs   (per-folder
//                 flat maps; latex-only, no lanes, no trust, no .texpile/config.json),
//                 mode, viewMode, diffLayout, pdfPaneFraction, terminalShrink,
//                 tabs, docPositions, collabName, recentFolders, completionUsage, preferences
//   settings.json: 25 unversioned keys, including layout fields, dictionary, the global
//                  compileCommand, lastFolder (pre-multi-window), and the compile toggles
//
// Two phases, because the inputs live in two stores with different access:
//
//   PHASE A (localStorage, synchronous) runs as a side-effect import - the FIRST import in
//   src/main.ts - so it completes before any module reads a storage key at load time (the theme,
//   the recents list). It must therefore import nothing that touches storage.
//
//   PHASE B (settings) runs inside loadSettings(), the one place settings are hydrated: an
//   unversioned settings object is slimmed to the v1 shape, its layout/user fields folded into
//   the (already-migrated) blobs, and the whole file replaced via the settings:replace bridge.
//
// Version checks make both phases one-time: a blob carrying { v: 1 } is never touched again.
// Migration is detected by SHAPE, never by app version - it survives skipped versions, crashes
// mid-migration (old keys still present: it just runs again), and downgrade-then-upgrade loops.
//
// Commands and outputs cannot land in their final home here: they now live in each folder's
// .texpile/config.json, which does not exist until that folder is opened. They go into the
// texpile:migration stash instead, which compileConfig consumes (and prunes) when it first
// seeds a folder's config file. A 0.16.1 user's own command is recorded as trusted at the same
// time - they typed it, and asking them to approve their own command would be absurd.

export type MigrationStash = {
	v: 1;
	/** per-folder compile config waiting for its .texpile/config.json to be seeded */
	folders?: Record<string, { command?: string; outputs?: { pdf?: string; log?: string } }>;
	/** the 0.16.1 global compile toggles, seeded into every folder's config on first open */
	toggles?: { draftMode?: boolean; typstLiveMode?: boolean; compileSentinel?: boolean };
};

const STASH_KEY = 'texpile:migration';

function norm(root: string) {
	return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function readJson<T>(key: string): T | null {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
	} catch {
		return null;
	}
}

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** true when `key` holds a v:1 blob already - the phase ran before */
function versioned(key: string): boolean {
	const v = readJson<{ v?: unknown }>(key);
	return isObj(v) && v.v === 1;
}

export function readMigrationStash(): MigrationStash | null {
	if (typeof localStorage === 'undefined') return null;
	const s = readJson<MigrationStash>(STASH_KEY);
	return isObj(s) && s.v === 1 ? s : null;
}

export function writeMigrationStash(stash: MigrationStash | null): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (stash && (Object.keys(stash.folders ?? {}).length || stash.toggles)) localStorage.setItem(STASH_KEY, JSON.stringify(stash));
		else localStorage.removeItem(STASH_KEY);
	} catch {
		/* storage disabled */
	}
}

// Phase A: localStorage

type FolderAcc = {
	main?: string;
	lastFile?: string;
	trusted?: { latex?: string; typst?: string };
	tabs?: string[];
	positions?: Record<string, unknown>;
};

export function migrateLocalStorage(): void {
	if (typeof localStorage === 'undefined') return;

	// workspaces
	if (!versioned('texpile:workspaces')) {
		const folders: Record<string, FolderAcc> = {};
		const stashFolders: NonNullable<MigrationStash['folders']> = {};
		function at(root: string): FolderAcc {
			return (folders[norm(root)] ??= {});
		}

		// unreleased dev shape: already one entry per folder, but unversioned and carrying the
		// latex/typst lanes that now live in .texpile/config.json (dev machines' config files
		// already hold those commands - the lanes are dropped, main/lastFile/trusted carry over)
		const dev = readJson<Record<string, unknown>>('texpile:workspaces');
		if (isObj(dev)) {
			for (const [root, e] of Object.entries(dev)) {
				if (!isObj(e)) continue;
				const entry = at(root);
				if (typeof e.main === 'string' && e.main) entry.main = e.main;
				if (typeof e.lastFile === 'string' && e.lastFile) entry.lastFile = e.lastFile;
				if (isObj(e.trusted)) entry.trusted = e.trusted as FolderAcc['trusted'];
			}
		}

		// 0.16.1's four flat maps. Latex-only era: the folder's command is one the user typed in
		// the modal themselves, so it is trusted by definition and stashed for the config seed.
		const mains = readJson<Record<string, unknown>>('texpile:mainFiles');
		if (isObj(mains)) for (const [root, rel] of Object.entries(mains)) if (typeof rel === 'string' && rel) at(root).main ??= rel;
		const lasts = readJson<Record<string, unknown>>('texpile:lastFiles');
		if (isObj(lasts)) for (const [root, rel] of Object.entries(lasts)) if (typeof rel === 'string' && rel) at(root).lastFile ??= rel;
		const cmds = readJson<Record<string, unknown>>('texpile:compileCommands');
		if (isObj(cmds)) {
			for (const [root, cmd] of Object.entries(cmds)) {
				if (typeof cmd !== 'string' || !cmd.trim()) continue;
				const entry = at(root);
				entry.trusted = { ...entry.trusted, latex: entry.trusted?.latex ?? cmd };
				(stashFolders[norm(root)] ??= {}).command ??= cmd;
			}
		}
		const outs = readJson<Record<string, unknown>>('texpile:compileOutputs');
		if (isObj(outs)) {
			for (const [root, o] of Object.entries(outs)) {
				if (!isObj(o)) continue;
				const outputs: { pdf?: string; log?: string } = {};
				if (typeof o.pdf === 'string' && o.pdf) outputs.pdf = o.pdf;
				if (typeof o.log === 'string' && o.log) outputs.log = o.log;
				if (outputs.pdf || outputs.log) (stashFolders[norm(root)] ??= {}).outputs ??= outputs;
			}
		}

		// session memory, keyed per folder in their old keys
		const tabs = readJson<Record<string, unknown>>('texpile:tabs');
		if (isObj(tabs)) {
			for (const [root, list] of Object.entries(tabs)) {
				if (Array.isArray(list)) at(root).tabs = list.filter((t): t is string => typeof t === 'string');
			}
		}
		const positions = readJson<Record<string, unknown>>('texpile:docPositions');
		if (isObj(positions)) {
			for (const [root, byRel] of Object.entries(positions)) if (isObj(byRel)) at(root).positions = byRel;
		}

		try {
			localStorage.setItem('texpile:workspaces', JSON.stringify({ v: 1, folders }));
			const prev = readMigrationStash();
			writeMigrationStash({ v: 1, ...prev, folders: { ...prev?.folders, ...stashFolders } });
			for (const k of [
				'texpile:mainFiles',
				'texpile:lastFiles',
				'texpile:compileCommands',
				'texpile:compileOutputs',
				'texpile:tabs',
				'texpile:docPositions'
			])
				localStorage.removeItem(k);
		} catch {
			/* storage disabled: nothing was deleted, so this simply runs again next launch */
		}
	}

	// layout
	if (!versioned('texpile:layout')) {
		const layout: Record<string, unknown> = { v: 1 };
		const mode = localStorage.getItem('texpile:mode');
		if (mode === 'light' || mode === 'dark' || mode === 'system') layout.theme = mode;
		const viewMode = localStorage.getItem('texpile:viewMode');
		if (viewMode === 'visual' || viewMode === 'source' || viewMode === 'diff') layout.viewMode = viewMode;
		const diffLayout = localStorage.getItem('texpile:diffLayout');
		if (diffLayout === 'unified' || diffLayout === 'split') layout.diffLayout = diffLayout;
		const frac = parseFloat(localStorage.getItem('texpile:pdfPaneFraction') ?? '');
		if (frac > 0 && frac < 1) layout.pdfPaneFraction = frac;
		const shrink = localStorage.getItem('texpile:terminalShrink');
		if (shrink === '1') layout.terminalShrink = true;
		// the web-era preferences blob's layout-ish fields (its flags land in users below)
		const prefsForLayout = readJson<Record<string, unknown>>('texpile:preferences');
		if (isObj(prefsForLayout)) {
			if (typeof prefsForLayout.zoom === 'number') layout.editorZoom = prefsForLayout.zoom;
			if (typeof prefsForLayout.pageView === 'boolean') layout.pageView = prefsForLayout.pageView;
			if (typeof prefsForLayout.previewVisible === 'boolean') layout.previewVisible = prefsForLayout.previewVisible;
		}
		try {
			localStorage.setItem('texpile:layout', JSON.stringify(layout));
			for (const k of ['texpile:mode', 'texpile:viewMode', 'texpile:diffLayout', 'texpile:pdfPaneFraction', 'texpile:terminalShrink'])
				localStorage.removeItem(k);
		} catch {
			/* storage disabled */
		}
	}

	// users
	if (!versioned('texpile:users')) {
		const u: Record<string, unknown> = { v: 1 };
		const name = localStorage.getItem('texpile:collabName');
		if (name) u.collabName = name;
		const recents = readJson<unknown>('texpile:recentFolders');
		if (Array.isArray(recents)) u.recentFolders = recents.filter((p): p is string => typeof p === 'string');
		const usage = readJson<Record<string, unknown>>('texpile:completionUsage');
		if (isObj(usage)) u.completionUsage = usage;
		// the web-era preferences blob: its dismissal flag is user memory (its layout fields went above)
		const prefs = readJson<Record<string, unknown>>('texpile:preferences');
		if (isObj(prefs) && prefs.advancedWarningDismissed === true) u.advancedWarningDismissed = true;
		try {
			localStorage.setItem('texpile:users', JSON.stringify(u));
			for (const k of ['texpile:collabName', 'texpile:recentFolders', 'texpile:completionUsage', 'texpile:preferences'])
				localStorage.removeItem(k);
		} catch {
			/* storage disabled */
		}
	}
}

// Phase B (settings.json) lives in ./settings.ts: it folds relocated fields into the layout and
// users SVELTE STORES, which must not be imported from this module - this one is evaluated before
// them (the whole point of phase A), and importing them here would hydrate them first.
