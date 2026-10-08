// @vitest-environment jsdom
// The migration's contract is defined by RELEASE 0.16.1 - these fixtures are that version's real
// storage shapes, read from the tag - plus the unreleased dev shapes between it and the
// restructure. Everything unversioned must land in the v1 blobs exactly once and delete itself.
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLocalStorage, readMigrationStash } from '$lib/migration/migrate';
import { migrateSettingsObject } from '$lib/migration/settings';

const read = (k: string) => JSON.parse(localStorage.getItem(k) ?? 'null');

beforeEach(() => {
	localStorage.clear();
});

/** a faithful 0.16.1 localStorage: four flat per-folder maps, bare UI keys, web-era preferences */
function seed0161() {
	localStorage.setItem('texpile:mainFiles', JSON.stringify({ 'C:/proj': 'main.tex' }));
	localStorage.setItem('texpile:lastFiles', JSON.stringify({ 'C:/proj': 'chapters/two.tex' }));
	localStorage.setItem('texpile:compileCommands', JSON.stringify({ 'C:/proj': 'latexmk -pdf {main}' }));
	localStorage.setItem('texpile:compileOutputs', JSON.stringify({ 'C:/proj': { pdf: 'out/main.pdf' } }));
	localStorage.setItem('texpile:tabs', JSON.stringify({ 'C:/proj': ['main.tex', 'refs.bib'] }));
	localStorage.setItem(
		'texpile:docPositions',
		JSON.stringify({ 'C:/proj': { 'main.tex': { row: 4, column: 2, firstVisibleLine: 1, at: 5 } } })
	);
	localStorage.setItem('texpile:mode', 'dark');
	localStorage.setItem('texpile:viewMode', 'source');
	localStorage.setItem('texpile:diffLayout', 'split');
	localStorage.setItem('texpile:pdfPaneFraction', '0.35');
	localStorage.setItem('texpile:terminalShrink', '1');
	localStorage.setItem('texpile:collabName', 'Lee');
	localStorage.setItem('texpile:recentFolders', JSON.stringify(['C:/proj']));
	localStorage.setItem('texpile:completionUsage', JSON.stringify({ '\\cite': { s: 2, t: 5 } }));
	localStorage.setItem(
		'texpile:preferences',
		JSON.stringify({ zoom: 1.2, pageView: true, onboardingCompleted: true, tourCompleted: false })
	);
}

describe('phase A: localStorage from 0.16.1', () => {
	it('folds the four flat maps into one versioned workspaces blob, keyed case-insensitively', () => {
		seed0161();
		migrateLocalStorage();
		const ws = read('texpile:workspaces');
		expect(ws.v).toBe(1);
		const entry = ws.folders['c:/proj'];
		expect(entry.main).toBe('main.tex');
		expect(entry.lastFile).toBe('chapters/two.tex');
		expect(entry.tabs).toEqual(['main.tex', 'refs.bib']);
		expect(entry.positions['main.tex'].row).toBe(4);
		// 0.16.1's command was typed by this user in the old modal: trusted, latex lane
		expect(entry.trusted.latex).toBe('latexmk -pdf {main}');
		for (const k of [
			'texpile:mainFiles',
			'texpile:lastFiles',
			'texpile:compileCommands',
			'texpile:compileOutputs',
			'texpile:tabs',
			'texpile:docPositions'
		])
			expect(localStorage.getItem(k), k).toBeNull();
	});

	it('stashes command and outputs for the folder`s .texpile/config.json seed', () => {
		seed0161();
		migrateLocalStorage();
		const stash = readMigrationStash();
		expect(stash?.folders?.['c:/proj']).toEqual({ command: 'latexmk -pdf {main}', outputs: { pdf: 'out/main.pdf' } });
	});

	it('builds the layout blob from the five bare keys plus the preferences blob`s layout fields', () => {
		seed0161();
		migrateLocalStorage();
		const layout = read('texpile:layout');
		expect(layout).toMatchObject({
			v: 1,
			theme: 'dark',
			viewMode: 'source',
			diffLayout: 'split',
			pdfPaneFraction: 0.35,
			terminalShrink: true,
			editorZoom: 1.2,
			pageView: true
		});
		for (const k of ['texpile:mode', 'texpile:viewMode', 'texpile:diffLayout', 'texpile:pdfPaneFraction', 'texpile:terminalShrink'])
			expect(localStorage.getItem(k), k).toBeNull();
	});

	it('builds the users blob and deletes the old keys including preferences', () => {
		seed0161();
		migrateLocalStorage();
		const users = read('texpile:users');
		expect(users).toMatchObject({
			v: 1,
			collabName: 'Lee',
			recentFolders: ['C:/proj'],
			completionUsage: { '\\cite': { s: 2, t: 5 } }
		});
		expect(users.onboardingCompleted).toBeUndefined();
		for (const k of ['texpile:collabName', 'texpile:recentFolders', 'texpile:completionUsage', 'texpile:preferences'])
			expect(localStorage.getItem(k), k).toBeNull();
	});

	it('is one-time: a second run leaves the v1 blobs alone', () => {
		seed0161();
		migrateLocalStorage();
		const before = localStorage.getItem('texpile:workspaces');
		// simulate later writes that a re-run must not clobber
		migrateLocalStorage();
		expect(localStorage.getItem('texpile:workspaces')).toBe(before);
	});

	it('carries the unreleased dev shape (unversioned workspaces entries) and drops its lanes', () => {
		localStorage.setItem(
			'texpile:workspaces',
			JSON.stringify({
				'c:/dev-proj': {
					main: 'main.typ',
					lastFile: 'main.typ',
					latex: { command: 'latexmk {main}' },
					typst: { command: 'tinymist compile {main}' },
					trusted: { typst: 'tinymist compile {main}' }
				}
			})
		);
		migrateLocalStorage();
		const entry = read('texpile:workspaces').folders['c:/dev-proj'];
		expect(entry.main).toBe('main.typ');
		expect(entry.trusted).toEqual({ typst: 'tinymist compile {main}' });
		// the lanes live in .texpile/config.json now (dev machines' config files already hold them)
		expect(entry.latex).toBeUndefined();
		expect(entry.typst).toBeUndefined();
	});

	it('runs clean on an empty profile (genuine first install)', () => {
		migrateLocalStorage();
		expect(read('texpile:workspaces')).toEqual({ v: 1, folders: {} });
		expect(read('texpile:layout').v).toBe(1);
		expect(read('texpile:users').v).toBe(1);
	});
});

describe('phase B: an unversioned settings.json', () => {
	const RAW_0161 = {
		reopenLastFolder: true,
		autosave: false,
		lastFolder: 'C:/proj',
		sidebarOpen: false,
		sidebarWidth: 300,
		spellcheck: true,
		dictionary: ['Texpile'],
		tocFraction: 0.3,
		compileCommand: 'latexmk -xelatex {main}',
		compileSentinel: false,
		terminalVisible: true,
		terminalHeight: 300,
		pdfPaneWidth: 480,
		pdfPaneOpen: true,
		pdfDarkPages: false,
		draftMode: true,
		checkForUpdates: true,
		uiZoom: 1.25,
		mathPreview: true,
		editorKeymap: 'vim',
		uiLocale: 'de',
		collabRelayUrl: 'wss://collab.texpile.com',
		mcpEnabled: false,
		mcpPort: 0,
		openFolders: []
	};

	it('slims to the v1 field set, dropping the dead and relocated keys', () => {
		migrateLocalStorage(); // create the blobs the relocations land in
		const out = migrateSettingsObject({ ...RAW_0161 })!;
		expect(out.v).toBe(1);
		for (const gone of [
			'lastFolder',
			'sidebarWidth',
			'dictionary',
			'tocFraction',
			'compileCommand',
			'compileSentinel',
			'terminalHeight',
			'pdfPaneWidth',
			'pdfPaneOpen',
			'pdfDarkPages',
			'draftMode',
			'autosave'
		])
			expect(out, gone).not.toHaveProperty(gone);
		expect(out).toMatchObject({ spellcheck: true, uiZoom: 1.25, editorKeymap: 'vim', uiLocale: 'de' });
	});

	it('folds lastFolder into openFolders for pre-multi-window installs', () => {
		const out = migrateSettingsObject({ ...RAW_0161 })!;
		expect(out.openFolders).toEqual(['C:/proj']);
		// but never overrides a real session list
		const out2 = migrateSettingsObject({ ...RAW_0161, openFolders: ['C:/other'] })!;
		expect(out2.openFolders).toEqual(['C:/other']);
	});

	it('relocates the layout fields and the user fields into their blobs', () => {
		migrateLocalStorage();
		migrateSettingsObject({ ...RAW_0161 });
		expect(read('texpile:layout')).toMatchObject({
			sidebarOpen: false,
			sidebarWidth: 300,
			tocFraction: 0.3,
			terminalHeight: 300,
			pdfDarkPages: false
		});
		expect(read('texpile:users').dictionary).toEqual(['Texpile']);
	});

	it('stashes the compile toggles for per-folder config seeding', () => {
		migrateSettingsObject({ ...RAW_0161 });
		// no typstLiveMode key: 0.16.1 predates the Typst preview, so there is nothing to carry
		expect(readMigrationStash()?.toggles).toEqual({ draftMode: true, compileSentinel: false });
	});

	it('leaves a v1 object untouched', () => {
		expect(migrateSettingsObject({ v: 1, uiZoom: 2 })).toBeNull();
	});
});
