import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Windows and macOS fold case, so `./fooPanel.svelte` written for fooPanel.svelte.ts loads FooPanel.svelte there.
// Linux keeps the two apart, and the app broke on Windows only (the bare table settings, 2.0.1)
function foldedTogether(dir: string, found: string[] = []): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const { name } of entries) {
		const reached = [name, name.replace(/\.[cm]?[jt]s$/, '')];
		for (const other of entries) {
			if (reached.includes(other.name) || !reached.some((r) => r.toLowerCase() === other.name.toLowerCase())) continue;
			found.push(`${join(dir, name)} and ${other.name}`);
		}
	}
	for (const entry of entries) if (entry.isDirectory()) foldedTogether(join(dir, entry.name), found);
	return found;
}

describe('file names', () => {
	it('stay apart where the file system folds case, with or without the script extension', () => {
		expect(foldedTogether(resolve(__dirname, '../../src'))).toEqual([]);
	});
});
