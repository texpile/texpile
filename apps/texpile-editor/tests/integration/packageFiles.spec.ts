import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
	Preferences,
	answerNextMessageBox,
	boxAsked,
	completeWhenShown,
	insertAtCaret,
	paletteLabels,
	runPaletteCommand,
	toasts
} from './driver/preferences';
import { useTexpile, type TexpileSession } from './driver/useTexpile';
import type { SourceEditor } from './driver/sourceEditor';

const DROPPED = 'Left out because it is not in the package file format.';
const GLOBAL = '../profile/packages';
const doc = (...packages: string[]) =>
	`\\documentclass{article}\n${packages.map((p) => `\\usepackage{${p}}\n`).join('')}\\begin{document}\nText.\n\\end{document}\n`;
const json = (value: unknown) => JSON.stringify(value, null, '\t');

const REVIEW = `{
	"version": 1,
	"macros": [
		{ "name": "reviewok", "doc": "A fine entry" },
		{ "name": "reviewdoc", "doc": 5 },
		{ "name": "reviewkind", "args": [{ "kind": "zz" }] },
		{ "name": "bad name" }
	],
	"envs": [{ "name": "reviewbox" }, { "name": "bad env" }]
}`;

const FILES = {
	// a folder package file that Texpile already ships with the fixture is inhousemacros, loaded by plain.tex
	[`${GLOBAL}/globalnotes.json`]: json({
		version: 1,
		macros: [{ name: 'gnote', args: [{ kind: 'm', placeholder: 'text' }], doc: 'A global note' }, { name: 'gnotelogo' }],
		envs: [{ name: 'gnotebox' }]
	}),
	[`${GLOBAL}/stacked.json`]: json({
		version: 1,
		macros: [{ name: 'stackone', args: [{ kind: 'm', placeholder: 'text' }], doc: 'Global one' }, { name: 'stackglobal' }]
	}),
	'.texpile/packages/stacked.json': json({
		version: 1,
		macros: [{ name: 'stackone', doc: 'Folder one' }, { name: 'stackfolder' }]
	}),
	'.texpile/packages/review.json': REVIEW,
	'.texpile/packages/oldfmt.json': '{ "macros": [{ "name": "oldcmd" }] }',
	'.texpile/packages/notjson.json': '{ nope',
	'.texpile/packages/notobject.json': '[1]',
	'.texpile/packages/editme.json': json({ version: 1, macros: [{ name: 'editone' }] }),
	'.texpile/packages/external.json': json({ version: 1, macros: [{ name: 'externalone' }] }),
	'external.tex': doc('external'),
	'.texpile/packages/throwaway.json': json({ version: 1, macros: [{ name: 'throwcmd' }] }),
	'.texpile/packages/restore.json': json({ version: 1, macros: [{ name: 'restorecmd' }] }),
	'restore.tex': doc('restore'),
	'a.tex': doc('globalnotes', 'review'),
	'plain.tex':
		'\\documentclass{report}\n\\usepackage{inhousemacros}\n\\usepackage{globalnotes}\n\\begin{document}\nText.\n\\end{document}\n',
	'talk.tex': '\\documentclass{beamer}\n\\usepackage{globalnotes}\n\\begin{document}\nText.\n\\end{document}\n',
	'st.tex': doc('stacked'),
	'review.tex': doc('review'),
	'editme.tex': doc('editme'),
	'throwaway.tex': doc('throwaway'),
	'unknown.tex': doc('zzqaunknownpkg', 'amsmath', 'review')
};

const texpile = useTexpile({ files: FILES });

async function labelsAfter(session: TexpileSession, file: string, typed: string, anchor = 'Text.\n'): Promise<string[]> {
	await session.source.open(file);
	return (await completeWhenShown(session.source, anchor, typed)).map((r) => r.label);
}

/** opens a package file from the palette and waits for its editor */
async function openPackageFile(source: SourceEditor, label: string): Promise<void> {
	await source.page.keyboard.press('Escape');
	await source.replacedBy(() => runPaletteCommand(source.page, label));
}

const bar = (page: Page, text: string | RegExp) => page.locator('.line-under').filter({ hasText: text });

test('a new package file with a dropped entry raises the skipped entries toast', async () => {
	const { page, userData } = texpile();
	fs.writeFileSync(path.join(userData, 'packages', 'fresh.json'), json({ version: 1, macros: [{ name: 'freshok' }, { name: 'x y' }] }));
	const toast = toasts(page).filter({ hasText: 'Some snippets were skipped (8)' });
	await expect(toast).toBeVisible({ timeout: 15_000 });
	await expect(toast).toContainText(/packages\/\w+\.json/);
});

test('the bar over a global package file with one dropped entry names it', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Global Package File for fresh');
	await expect(bar(page, 'Commands for the fresh package in every folder')).toContainText(`1 entry did not load. "x y": ${DROPPED}`);
});

test('a folder package file completes its commands with their arguments', async () => {
	const session = texpile();
	await session.source.open('plain.tex');
	const rows = await completeWhenShown(session.source, 'Text.\n', '\\inhou');
	expect(rows).toContainEqual({ label: '\\inhousecite', detail: '[]{}' });
	expect(rows.map((r) => r.label)).toContain('\\inhouselogo');
});

test('a folder package file completes its environment', async () => {
	const session = texpile();
	await session.source.open('plain.tex');
	const rows = await completeWhenShown(session.source, 'Text.\n', '\\begin{inhouseb');
	expect(rows.map((r) => r.label)).toContain('inhousebox');
});

test('a folder package file command shows its documentation on hover', async () => {
	const { source } = texpile();
	await source.open('plain.tex');
	const before = await source.text();
	await insertAtCaret(source, 'Text.\n', '\\inhousecite[3]{k}');
	const tip = await source.hover('\\inhousecite', { offset: 4 });
	await source.restore(before);
	expect(tip).toContain('Cites the in-house archive.');
	expect(tip).toContain('\\inhousecite[]{}');
});

test('a folder package file command shows its arguments as a hint while typing', async () => {
	const { source } = texpile();
	await source.open('plain.tex');
	const before = await source.text();
	await source.caretAfter('Text.\n');
	await source.type('\\inhousecite[');
	await expect.poll(() => source.hint()).toContain('\\inhousecite[page]{key}');
	await source.press('Escape');
	await source.restore(before);
});

test('a command is not offered in a file that does not load its package', async () => {
	const session = texpile();
	const labels = await labelsAfter(session, 'main.tex', '\\inh', '\\label{sec:intro}\n');
	expect(labels).not.toContain('\\inhousecite');
	expect(labels).not.toContain('\\inhouselogo');
});

test('a global package file works in every file that loads it', async () => {
	const session = texpile();
	for (const file of ['a.tex', 'plain.tex', 'talk.tex']) {
		expect(await labelsAfter(session, file, '\\gnote'), file).toEqual(expect.arrayContaining(['\\gnote', '\\gnotelogo']));
	}
});

test('a global package file environment completes', async () => {
	const session = texpile();
	await session.source.open('talk.tex');
	const rows = await completeWhenShown(session.source, 'Text.\n', '\\begin{gnoteb');
	expect(rows.map((r) => r.label)).toContain('gnotebox');
});

test('a global package file command shows its documentation on hover', async () => {
	const { source } = texpile();
	await source.open('a.tex');
	const before = await source.text();
	await insertAtCaret(source, 'Text.\n', '\\gnote{k}');
	const tip = await source.hover('\\gnote', { offset: 3 });
	await source.restore(before);
	expect(tip).toContain('A global note');
});

test('a folder package file over a global one replaces what it states and keeps the rest', async () => {
	const { source } = texpile();
	await source.open('st.tex');
	const before = await source.text();
	const rows = await completeWhenShown(source, 'Text.\n', '\\stack');
	expect(rows).toEqual(
		expect.arrayContaining([
			{ label: '\\stackone', detail: '{}' },
			{ label: '\\stackglobal', detail: '' },
			{ label: '\\stackfolder', detail: '' }
		])
	);
	await insertAtCaret(source, 'Text.\n', '\\stackone{k}');
	expect(await source.hover('\\stackone', { offset: 4 })).toContain('Folder one');
	await source.restore(before);
});

test('entries in the format load and the others are left out', async () => {
	const session = texpile();
	const macros = await labelsAfter(session, 'review.tex', '\\review');
	expect(macros).toEqual(expect.arrayContaining(['\\reviewok', '\\reviewbox']));
	expect(macros).not.toContain('\\reviewdoc');
	expect(macros).not.toContain('\\reviewkind');
	const envs = await completeWhenShown(session.source, 'Text.\n', '\\begin{review');
	expect(envs.map((r) => r.label)).toEqual(['reviewbox']);
});

test('completion of ordinary commands works in a file whose package file has bad entries', async () => {
	const session = texpile();
	expect(await labelsAfter(session, 'review.tex', '\\textb')).toContain('\\textbf');
	expect(session.takeErrors()).toEqual([]);
});

test('the bar over a package file with bad entries names the first and lists every dropped entry', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for review');
	const notice = bar(page, 'Commands for the review package in this folder');
	await expect(notice).toBeVisible();
	await expect(notice).toContainText(`4 entries did not load. "reviewdoc": ${DROPPED}`);
	const all = (await notice.getByRole('button', { name: 'Show all' }).getAttribute('data-tip')) ?? '';
	for (const name of ['reviewdoc', 'reviewkind', 'bad name', 'bad env']) expect(all, name).toContain(`"${name}": ${DROPPED}`);
});

test('a package file with bad entries lists its warning under Manage in Preferences', async () => {
	const { page } = texpile();
	const prefs = new Preferences(page);
	await prefs.open();
	await prefs.goTo('LaTeX');
	await prefs.manage().click();
	const row = prefs.dialog.locator('li').filter({ has: page.getByText('review', { exact: true }) });
	await expect(row).toContainText(`4 entries did not load. "reviewdoc": ${DROPPED}`);
	await prefs.close();
});

test('a package file with invalid JSON shows a problem and loads nothing from it', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for notjson');
	await expect(bar(page, 'Commands for the notjson package in this folder')).toContainText(
		'This file did not load. The file is not valid JSON: line 1, column 3'
	);
});

test('a package file that is not an object shows a problem', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for notobject');
	await expect(bar(page, 'Commands for the notobject package in this folder')).toContainText(
		'This file did not load. The file needs to start with { and end with }.'
	);
});

test('a package file in the old format says so', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for oldfmt');
	await expect(bar(page, 'Commands for the oldfmt package in this folder')).toContainText(
		'This file did not load. The file is in the old package file format.'
	);
});

test('the bar names a folder package file as in this folder', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for inhousemacros');
	const notice = bar(page, 'Commands for the inhousemacros package in this folder');
	await expect(notice).toBeVisible();
	await expect(notice.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://texpile.com/docs/package-files');
	await expect(notice.getByRole('button', { name: 'Show all' })).toHaveCount(0);
});

test('the bar names a global package file as in every folder', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Global Package File for globalnotes');
	await expect(bar(page, 'Commands for the globalnotes package in every folder')).toBeVisible();
});

test('the palette lists a package file of each place for editing', async () => {
	const { page, source } = texpile();
	await source.open('a.tex');
	const labels = await paletteLabels(page, 'package file');
	expect(labels).toEqual(
		expect.arrayContaining([
			'Edit Package File for inhousemacros',
			'Edit Package File for review',
			'Edit Global Package File for globalnotes'
		])
	);
});

test('editing a package file in the app updates completion without reloading', async () => {
	const session = texpile();
	const { source } = session;
	expect(await labelsAfter(session, 'editme.tex', '\\edit')).not.toContain('\\edittwo');
	await openPackageFile(source, 'Edit Package File for editme');
	await source.caretAfter('"macros": [');
	await source.type(' { "name": "edittwo", "doc": "Added in the app" },');
	await expect.poll(() => source.text()).toContain('"edittwo"');
	expect(() => JSON.parse(fs.readFileSync(source.path('.texpile/packages/editme.json'), 'utf8'))).not.toThrow();
	await expect
		.poll(() => fs.readFileSync(source.path('.texpile/packages/editme.json'), 'utf8'), { timeout: 10_000 })
		.toContain('"edittwo"');
	await expect
		.poll(async () => labelsAfter(session, 'editme.tex', '\\edit'), { timeout: 10_000 })
		.toEqual(expect.arrayContaining(['\\editone', '\\edittwo']));
});

test('breaking a package file shows the problem and fixing it loads its commands again', async () => {
	const session = texpile();
	const { page, source } = session;
	await openPackageFile(source, 'Edit Package File for editme');
	await source.caretAfter('"macros": [');
	await source.type('@');
	await expect(bar(page, 'Commands for the editme package in this folder')).toContainText('This file did not load.', {
		timeout: 10_000
	});
	await page.keyboard.press('Backspace');
	await expect(bar(page, 'Commands for the editme package in this folder')).not.toContainText('did not load', { timeout: 10_000 });
	expect(await labelsAfter(session, 'editme.tex', '\\edit')).toEqual(expect.arrayContaining(['\\editone', '\\edittwo']));
});

test('a global package file added while the app runs works without a restart', async () => {
	const session = texpile();
	const { page, source, userData } = session;
	fs.writeFileSync(path.join(userData, 'packages', 'later.json'), json({ version: 1, macros: [{ name: 'latercmd', doc: 'Added later' }] }));
	fs.writeFileSync(source.path('later.tex'), doc('later'));
	await expect.poll(() => paletteLabels(page, 'Global Package File'), { timeout: 15_000 }).toContain('Edit Global Package File for later');
	await page.waitForTimeout(500);
	await page.evaluate(
		async () => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).texFiles.current.length
	);
	await expect.poll(async () => labelsAfter(session, 'later.tex', '\\later'), { timeout: 10_000 }).toContain('\\latercmd');
});

test('Show all in the bar lists every dropped entry of the file in Preferences', async () => {
	const { page, source } = texpile();
	await openPackageFile(source, 'Edit Package File for review');
	await bar(page, 'Commands for the review package in this folder').getByRole('button', { name: 'Show all' }).click();
	const prefs = new Preferences(page);
	await expect(prefs.dialog).toBeVisible();
	await expect(prefs.header()).toHaveText('Snippets');
	await expect(prefs.dialog.getByText('Entries that did not load')).toBeVisible();
	for (const name of ['reviewdoc', 'reviewkind', 'bad name', 'bad env'])
		await expect(prefs.dialog.getByText(`.texpile/packages/review.json, "${name}": ${DROPPED}`)).toBeVisible();
	await prefs.close();
});

test('a change to a folder package file made outside the app is picked up', async () => {
	const session = texpile();
	const before = await labelsAfter(session, 'external.tex', '\\external');
	expect(before).toContain('\\externalone');
	expect(before).not.toContain('\\externaltwo');
	fs.writeFileSync(
		session.source.path('.texpile/packages/external.json'),
		json({ version: 1, macros: [{ name: 'externalone' }, { name: 'externaltwo' }] })
	);
	await expect
		.poll(async () => labelsAfter(session, 'external.tex', '\\external'), { timeout: 20_000 })
		.toEqual(expect.arrayContaining(['\\externalone', '\\externaltwo']));
});

test('a folder package file created outside the app is listed and completes', async () => {
	const session = texpile();
	fs.writeFileSync(session.source.path('.texpile/packages/newext.json'), json({ version: 1, macros: [{ name: 'newextcmd' }] }));
	fs.writeFileSync(session.source.path('newext.tex'), doc('newext'));
	await expect.poll(async () => labelsAfter(session, 'newext.tex', '\\newext'), { timeout: 20_000 }).toContain('\\newextcmd');
	expect(await paletteLabels(session.page, 'Package File for newext')).toContain('Edit Package File for newext');
});

test('Save Package File is offered for a package without data and leaves the others out', async () => {
	const { page, source } = texpile();
	await source.open('unknown.tex');
	const labels = await paletteLabels(page, 'Save Package File');
	expect(labels).toContain('Save Package File for zzqaunknownpkg');
	expect(labels.join('\n')).not.toContain('amsmath');
	expect(labels.join('\n')).not.toContain('for review');
});

test('Save Package File for a package TeX does not have says so and writes nothing', async () => {
	const { page, source } = texpile();
	await source.open('unknown.tex');
	await runPaletteCommand(page, 'Save Package File for zzqaunknownpkg');
	await expect(toasts(page).filter({ hasText: 'zzqaunknownpkg.sty is not in the TeX installation' }).first()).toBeVisible();
	expect(fs.existsSync(source.path('.texpile/packages/zzqaunknownpkg.json'))).toBe(false);
});

async function manageList(session: TexpileSession): Promise<Preferences> {
	const prefs = new Preferences(session.page);
	await prefs.open();
	await prefs.goTo('LaTeX');
	if ((await prefs.manage().getAttribute('aria-expanded')) !== 'true') await prefs.manage().click();
	return prefs;
}

test('Delete under Manage removes a folder package file and its commands', async () => {
	const session = texpile();
	const { app, page, source } = session;
	expect(await labelsAfter(session, 'throwaway.tex', '\\throw')).toContain('\\throwcmd');
	const prefs = await manageList(session);
	await answerNextMessageBox(app, 'Delete');
	await prefs.dialog.getByRole('button', { name: 'Delete the package file for throwaway' }).click();
	await expect.poll(() => fs.existsSync(source.path('.texpile/packages/throwaway.json'))).toBe(false);
	expect((await boxAsked(app))?.message).toBe('Delete the package file for throwaway?');
	await expect(prefs.dialog.getByRole('button', { name: 'Open the package file for throwaway' })).toHaveCount(0);
	await expect(toasts(page).filter({ hasText: 'Deleted the package file for throwaway' })).toBeVisible();
	await prefs.close();
	expect(await labelsAfter(session, 'throwaway.tex', '\\throw')).not.toContain('\\throwcmd');
});

test('Undo on the Deleted toast brings a package file and its commands back', async () => {
	const session = texpile();
	const { app, page, source } = session;
	const prefs = await manageList(session);
	await answerNextMessageBox(app, 'Delete');
	await prefs.dialog.getByRole('button', { name: 'Delete the package file for restore' }).click();
	await expect.poll(() => fs.existsSync(source.path('.texpile/packages/restore.json'))).toBe(false);
	const toast = toasts(page).filter({ hasText: 'Deleted the package file for restore' });
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => fs.existsSync(source.path('.texpile/packages/restore.json'))).toBe(true);
	await expect(prefs.dialog.getByRole('button', { name: 'Open the package file for restore' })).toBeVisible();
	await prefs.close();
	expect(await labelsAfter(session, 'restore.tex', '\\restor')).toContain('\\restorecmd');
});

test('cancelling the Delete question keeps the package file', async () => {
	const session = texpile();
	const { app, page, source } = session;
	const prefs = await manageList(session);
	await answerNextMessageBox(app, 'Cancel');
	await prefs.dialog.getByRole('button', { name: 'Delete the package file for editme' }).click();
	await expect.poll(() => boxAsked(app)).not.toBeNull();
	await page.waitForTimeout(500);
	expect(fs.existsSync(source.path('.texpile/packages/editme.json'))).toBe(true);
	await expect(prefs.dialog.getByRole('button', { name: 'Open the package file for editme' })).toBeVisible();
	await prefs.close();
});

test.describe('every field of the format', () => {
	const pkgDoc = (cls: string, ...head: string[]) =>
		`\\documentclass{${cls}}\n${head.join('\n')}\n\\begin{document}\nText.\n\n$x$\n\\end{document}\n`;
	const fields = useTexpile({
		files: {
			'.texpile/packages/rich.json': json({
				version: 1,
				deps: [{ id: 'packages/booktabs' }, { id: 'packages/fontspec', if: '!draft', engines: ['lualatex', 'xelatex'] }],
				macros: [
					{
						name: 'richone',
						args: [{ kind: 's' }, { kind: 'o', placeholder: 'options', keys: ['packages/rich#note'] }, { kind: 'm', placeholder: 'text' }],
						doc: 'Rich one',
						prints: '✎'
					},
					{ name: 'richdraft', if: 'draft', doc: 'Only with draft' },
					{ name: 'richmath', in: 'math' },
					{ name: 'richtext', in: 'text' },
					{ name: 'richhidden', hidden: true },
					{ name: 'richvals', args: [{ kind: 'o', placeholder: 'pos', values: ['t', 'c', 'b'] }] }
				],
				envs: [{ name: 'richbox', args: [{ kind: 'o' }], star: { args: [] } }],
				keys: {
					'packages/rich#note': [
						{ key: 'color', placeholder: 'color' },
						{ key: 'inline', bare: true }
					],
					'packages/rich#options': [
						{ key: 'draft', bare: true },
						{ key: 'final', bare: true }
					]
				}
			}),
			'.texpile/packages/booktabs.json': json({ version: 1, macros: [{ name: 'toprule', remove: true }, { name: 'qatoprule' }] }),
			'.texpile/packages/class-thesis.json': json({ version: 1, macros: [{ name: 'thesischap' }] }),
			'.texpile/packages/hostile.json': json({
				version: 1,
				deps: [{ id: 'packages/doesnotexist' }, { id: 'packages/hostile' }, { id: 5 }],
				macros: 'oops',
				envs: [null, 5, 'x', { name: 5 }, { name: 'hostok' }],
				keys: []
			}),
			'.texpile/packages/hostile2.json': json({
				version: 1,
				macros: [null, { name: 'hosttwook' }, { name: 'hosttwoargs', args: 'x' }, { name: 'hosttwoin', in: 'bogus' }],
				keys: { group: 'x', 'packages/hostile2#o': [{ key: 5 }, { key: 'fine' }] }
			}),
			'rich.tex': pkgDoc('article', '\\usepackage{rich}'),
			'richdraft.tex': pkgDoc('article', '\\usepackage[draft]{rich}'),
			'bt.tex': pkgDoc('article', '\\usepackage{booktabs}'),
			'thesis.tex': pkgDoc('thesis'),
			'hostile.tex': pkgDoc('article', '\\usepackage{hostile}', '\\usepackage{hostile2}')
		}
	});

	const rowsAfter = (file: string, typed: string, anchor = 'Text.\n') =>
		fields()
			.source.open(file)
			.then(() => completeWhenShown(fields().source, anchor, typed));

	test('an s argument makes the starred form complete', async () => {
		const labels = (await rowsAfter('rich.tex', '\\richo')).map((r) => r.label);
		expect(labels).toEqual(expect.arrayContaining(['\\richone', '\\richone*']));
	});

	test('prints is shown beside the command name', async () => {
		expect(await rowsAfter('rich.tex', '\\richo')).toContainEqual({ label: '\\richone', detail: '✎' });
	});

	test('a command that works in math completes in math and not in text', async () => {
		const inText = (await rowsAfter('rich.tex', '\\rich')).map((r) => r.label);
		expect(inText).toContain('\\richtext');
		expect(inText).not.toContain('\\richmath');
		const inMath = (await rowsAfter('rich.tex', '\\rich', 'Text.\n\n$')).map((r) => r.label);
		expect(inMath).toContain('\\richmath');
	});

	test('a command with if completes only when the package option is given', async () => {
		expect((await rowsAfter('rich.tex', '\\rich')).map((r) => r.label)).not.toContain('\\richdraft');
		expect((await rowsAfter('richdraft.tex', '\\rich')).map((r) => r.label)).toContain('\\richdraft');
	});

	test('a hidden command stays out of the list', async () => {
		expect((await rowsAfter('rich.tex', '\\rich')).map((r) => r.label)).not.toContain('\\richhidden');
	});

	test('the keys of an optional argument complete inside its brackets', async () => {
		const labels = (await rowsAfter('rich.tex', '\\richone[')).map((r) => r.label);
		expect(labels).toEqual(expect.arrayContaining(['color=', 'inline']));
	});

	test('the values of an optional argument complete inside its brackets', async () => {
		const labels = (await rowsAfter('rich.tex', '\\richvals[')).map((r) => r.label);
		expect(labels).toEqual(['t', 'c', 'b']);
	});

	test('the options group completes the options of \\usepackage', async () => {
		const labels = (await rowsAfter('rich.tex', '[dra', '\\usepackage')).map((r) => r.label);
		expect(labels).toContain('draft');
	});

	test('an environment with a star completes both forms', async () => {
		const labels = (await rowsAfter('rich.tex', '\\begin{richb')).map((r) => r.label);
		expect(labels).toEqual(expect.arrayContaining(['richbox', 'richbox*']));
	});

	test('remove takes a shipped command out and a package file adds its own beside the others', async () => {
		const top = (await rowsAfter('bt.tex', '\\toprul')).map((r) => r.label);
		expect(top).not.toContain('\\toprule');
		expect(top).toContain('\\qatoprule');
		expect((await rowsAfter('bt.tex', '\\midrul')).map((r) => r.label)).toContain('\\midrule');
	});

	test('a class- file adds commands for the document class', async () => {
		expect((await rowsAfter('thesis.tex', '\\thesisc')).map((r) => r.label)).toContain('\\thesischap');
	});

	test('a file of wrong-typed lists and entries still lets the good entries complete', async () => {
		const session = fields();
		expect((await rowsAfter('hostile.tex', '\\begin{hostok')).map((r) => r.label)).toContain('hostok');
		expect((await rowsAfter('hostile.tex', '\\hosttwo')).map((r) => r.label)).toContain('\\hosttwook');
		expect((await rowsAfter('hostile.tex', '\\hosttwo')).map((r) => r.label)).not.toContain('\\hosttwoargs');
		expect((await rowsAfter('hostile.tex', '\\hosttwo')).map((r) => r.label)).not.toContain('\\hosttwoin');
		expect(session.takeErrors()).toEqual([]);
	});

	test('the bar names every entry of the wrong type that was left out', async () => {
		const { page, source } = fields();
		await openPackageFile(source, 'Edit Package File for hostile2');
		const notice = bar(page, 'Commands for the hostile2 package in this folder');
		const all = (await notice.getByRole('button', { name: 'Show all' }).getAttribute('data-tip')) ?? '';
		for (const name of ['hosttwoargs', 'hosttwoin', 'keys.group']) expect(all, name).toContain(`"${name}": ${DROPPED}`);
	});
});

test.describe('every dropped entry is reported', () => {
	const dropped = useTexpile({
		files: {
			'.texpile/packages/dupa.json': json({ version: 1, macros: [{ name: 'samename', doc: 5 }] }),
			'.texpile/packages/dupb.json': json({ version: 1, macros: [{ name: 'samename', doc: 5 }] }),
			'.texpile/packages/unnamed.json': json({ version: 1, macros: [5, null, 'x'], envs: [{ name: 5 }] }),
			'.texpile/packages/oddlist.json': json({ version: 1, macros: 'oops', envs: [{ name: 'oddenv' }] })
		}
	});

	// soft checks, so one gap does not hide the next
	test('each file says what it dropped, whatever another file dropped, and counts them all', async () => {
		const { page, source } = dropped();
		const barOf = async (name: string) => {
			await openPackageFile(source, `Edit Package File for ${name}`);
			return bar(page, `Commands for the ${name} package in this folder`);
		};
		const wait = { timeout: 5000 };
		await expect.soft(await barOf('dupa'), 'dupa drops "samename"').toContainText(`1 entry did not load. "samename": ${DROPPED}`, wait);
		await expect
			.soft(await barOf('dupb'), 'dupb drops "samename" like dupa does, and only dupa says so')
			.toContainText(`1 entry did not load. "samename": ${DROPPED}`, wait);
		await expect
			.soft(await barOf('unnamed'), 'macros holds three entries that are not objects and envs one more')
			.toContainText('4 entries did not load.', wait);
		await expect.soft(await barOf('oddlist'), 'macros is a string and the bar says nothing about it').toContainText('did not load', wait);
	});
});
