import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { Preferences, answerNextMessageBox, boxAsked, completeWhenShown, toasts } from './driver/preferences';
import { useTexpile, type TexpileSession } from './driver/useTexpile';

const doc = (...packages: string[]) =>
	`\\documentclass{article}\n${packages.map((p) => `\\usepackage{${p}}\n`).join('')}\\begin{document}\nText.\n\\end{document}\n`;
const json = (value: unknown) => JSON.stringify(value, null, '\t');

const texpile = useTexpile({
	files: {
		'.texpile/packages/external.json': json({ version: 1, macros: [{ name: 'externalone' }] }),
		'external.tex': doc('external'),
		'.texpile/packages/throwaway.json': json({ version: 1, macros: [{ name: 'throwcmd' }] }),
		'throwaway.tex': doc('throwaway')
	}
});

async function labelsAfter(session: TexpileSession, file: string, typed: string, anchor = 'Text.\n'): Promise<string[]> {
	await session.source.open(file);
	return (await completeWhenShown(session.source, anchor, typed)).map((r) => r.label);
}

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
