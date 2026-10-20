import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { PREFS_ROWS } from '$lib/modals/window/search/prefsRows';
import { searchRows } from '$lib/modals/window/search/prefsSearch';

const ids = (query: string) => searchRows(query).flatMap((g) => g.sections.flatMap((s) => s.rows.map((r) => r.id)));

afterEach(() => overwriteGetLocale(() => 'en'));

describe('searching Preferences', () => {
	it('finds a row by its label in the reading language', () => {
		expect(ids('smart paste')).toContain('smart-paste');
		overwriteGetLocale(() => 'de');
		expect(ids('Rechtschreibung')).toContain('spellcheck');
	});

	it('finds a row by a word in its note and files it under its tab', () => {
		const groups = searchRows('hyphens');
		expect(groups.map((g) => g.tab)).toEqual(['editor']);
		expect(ids('hyphens')).toContain('visual-hyphenate');
	});

	it('finds nothing for a word no row has', () => {
		expect(searchRows('zzqqxx')).toEqual([]);
	});
});

const root = resolve(__dirname, '../../../../../../src/lib/modals/window');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.svelte$/.test(name) ? [path] : [];
	});
}

describe('the rows on screen', () => {
	const files = [...sourceFiles(root), resolve(root, '../../../lib/ai/agentPanel/ui/AgentPanelPrefs.svelte')];
	const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
	// the snippets panel hands its ids to a snippet, not to the row component
	const used = [
		...text.matchAll(/<Prefs(?:Row|SwitchRow|SelectRow)\b[^>]*?\bid=(?:"([^"]+)"|\{([^}]+)\})|\{@render fileRow\(\s*'([^']+)'/g)
	].map((u) => [u[0], u[1] ?? u[3], u[2]] as const);

	it('are all registered', () => {
		const known = new Set(PREFS_ROWS.map((r) => r.id));
		for (const [, fixed] of used) if (fixed) expect(known, fixed).toContain(fixed);
	});

	it('leave no registered row unused', () => {
		const fixed = new Set(used.map((u) => u[1]).filter(Boolean));
		const dynamic = used.some((u) => u[2]?.includes('RowId('));
		for (const row of PREFS_ROWS) {
			if (/^(latex|folder)-check-/.test(row.id)) expect(dynamic, row.id).toBe(true);
			// the two package lists pick their id from the layer
			else if (/^package-files-(global|folder)$/.test(row.id)) expect(text, row.id).toContain(`'${row.id}'`);
			else expect(fixed, row.id).toContain(row.id);
		}
	});
});
