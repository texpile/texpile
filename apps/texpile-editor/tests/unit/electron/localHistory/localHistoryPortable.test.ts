// A portable Texpile files a project on its own drive by the path from the drive's root, so the
// history is found again when the drive gets another letter on the next computer, and when the
// app's folder is moved to another folder on the drive. Drives are folders here, each the root of
// the paths under it, as "E:\" is on Windows.
import { it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';

const { join } = nodePath;
const E = join(tmpdir(), 'E');
const F = join(tmpdir(), 'F');

vi.mock('node:path', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:path')>();
	const parse = (p: string) => {
		const drive = [E, F].find((d) => p === d || p.startsWith(d + actual.sep));
		return drive ? { ...actual.parse(p), root: drive + actual.sep } : actual.parse(p);
	};
	return { ...actual, parse, default: { ...actual, parse } };
});

const { LocalHistory } = await import('../../../../../../electron/src/localHistory');

const homes: string[] = [];
afterEach(() => {
	for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

function home(): string {
	const h = mkdtempSync(join(tmpdir(), 'texpile-history-portable-'));
	homes.push(h);
	return h;
}

it('finds a project on the app’s drive when the drive has another letter', async () => {
	const h = home();
	await new LocalHistory(h, {}, join(E, 'Texpile')).add(join(E, 'thesis', 'main.tex'), 'written on E:');
	const [folder] = readdirSync(h);
	expect(JSON.parse(readFileSync(join(h, folder, 'entries.json'), 'utf8')).resource).toBe(join('thesis', 'main.tex'));
	const onF = new LocalHistory(h, {}, join(F, 'Texpile'));
	const moved = join(F, 'thesis', 'main.tex');
	const entries = await onF.list(moved);
	expect(await onF.read(moved, entries[0].id)).toBe('written on E:');
	expect((await onF.all(join(F, 'thesis'))).map((f) => f.resource)).toEqual([moved]);
});

it('finds it after the app’s folder moved to another folder on the same drive', async () => {
	const h = home();
	const file = join(E, 'thesis', 'main.tex');
	await new LocalHistory(h, {}, join(E, 'Texpile')).add(file, 'written');
	const after = new LocalHistory(h, {}, join(E, 'Apps', 'Texpile'));
	const entries = await after.list(file);
	expect(entries).toHaveLength(1);
	expect(await after.read(file, entries[0].id)).toBe('written');
	expect((await after.all(join(E, 'thesis'))).map((f) => f.resource)).toEqual([file]);
});

it('finds the deleted files of a project at the root of the app’s own drive', async () => {
	const h = home();
	const onE = new LocalHistory(h, {}, join(E, 'Texpile'));
	await onE.add(join(E, 'main.tex'), 'written');
	expect((await onE.all(E + nodePath.sep)).map((f) => f.resource)).toEqual([join(E, 'main.tex')]);
});

it('files a project on another drive by its whole path', async () => {
	const h = home();
	const elsewhere = join(tmpdir(), 'C', 'thesis', 'main.tex');
	await new LocalHistory(h, {}, join(E, 'Texpile')).add(elsewhere, 'on the computer');
	const [folder] = readdirSync(h);
	expect(JSON.parse(readFileSync(join(h, folder, 'entries.json'), 'utf8')).resource).toBe(elsewhere);
});
