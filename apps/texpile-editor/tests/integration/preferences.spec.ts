import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Preferences, diagnosticsMatching } from './driver/preferences';
import { useTexpile, type TexpileSession } from './driver/useTexpile';

const GLOBAL = '../profile/packages';
const CHECKS_TEX = `\\documentclass{article}
\\usepackage{fontspec}
\\usepackage{cleveref}
\\usepackage[colorlinks, linkcolour=red]{hyperref}
\\begin{document}
Text \\setcion{X} here.

Math $x$ and
\\end{document}
`;
const UNKNOWN_TEX = '\\documentclass{article}\n\\usepackage{zzqaunknownpkg}\n\\begin{document}\nText.\n\\end{document}\n';

// the four live checks, each with a line of checks.tex that triggers it
const CHECKS = [
	{ label: 'Undefined commands', id: 'undefined-command', message: /Define \\setcion or load a package that provides it\./ },
	{ label: 'Engine support', id: 'engine', message: /fontspec needs LuaLaTeX or XeLaTeX\./ },
	{ label: 'Package options', id: 'unknown-option', message: /Did you mean linkcolor\?/ },
	{ label: 'Package conflicts', id: 'package-clash', message: /Load hyperref before cleveref\./ }
];

const TABS = [
	'Appearance',
	'Editor',
	'LaTeX',
	'Typst',
	'Snippets',
	'Keyboard Shortcuts',
	'Spelling',
	'Version Control',
	'Collaboration',
	'Programs & Compiler',
	'Integrations',
	'Startup',
	'AI Assistant'
];

const texpile = useTexpile({
	files: {
		'checks.tex': CHECKS_TEX,
		'unknownpkg.tex': UNKNOWN_TEX,
		// the engine check needs an engine the folder's command names
		'.texpile/config.json': JSON.stringify({ v: 1, latex: { command: 'pdflatex {main}' } }),
		[`${GLOBAL}/gone.json`]: '{ "version": 1, "macros": [{ "name": "gonecmd" }] }',
		[`${GLOBAL}/gtwo.json`]: '{ "version": 1, "macros": [{ "name": "gtwocmd" }] }'
	}
});

function prefsOf(session: TexpileSession): Preferences {
	return new Preferences(session.page);
}

/** Preferences, opened when it is not */
async function opened(session: TexpileSession): Promise<Preferences> {
	const prefs = prefsOf(session);
	await prefs.ensureOpen();
	return prefs;
}

async function settingsOnDisk(session: TexpileSession): Promise<Record<string, unknown>> {
	return JSON.parse(fs.readFileSync(path.join(session.userData, 'settings.json'), 'utf8'));
}

test.describe('opening and closing', () => {
	test('Ctrl+Comma opens Preferences from the workspace, on Appearance', async () => {
		const prefs = prefsOf(texpile());
		await prefs.open();
		await expect(prefs.header()).toHaveText('Appearance');
		await expect(prefs.tab('Appearance')).toHaveAttribute('aria-current', 'page');
	});
});

test.describe('the sidebar', () => {
	test('every tab opens with its name as the header and no errors', async () => {
		const session = texpile();
		const prefs = await opened(session);
		for (const name of TABS) {
			await prefs.goTo(name);
			await expect(prefs.header(), name).toHaveText(name);
			await expect(prefs.tab(name)).toHaveAttribute('aria-current', 'page');
		}
		expect(session.takeErrors()).toEqual([]);
	});
});

test.describe('IntelliSense switches', () => {
	async function setSwitch(session: TexpileSession, label: string, on: boolean): Promise<void> {
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		const input = prefs.switchFor(label);
		if ((await input.isChecked()) !== on) await prefs.toggle(label);
		await expect(input).toBeChecked({ checked: on });
		await prefs.close();
	}

	test('the Undefined commands check warns, and switching it off clears the warning in the open editor', async () => {
		const session = texpile();
		const check = CHECKS[0];
		await session.source.open('checks.tex');
		await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
		await setSwitch(session, check.label, false);
		await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(0);
		await setSwitch(session, check.label, true);
		await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
	});

	test('switches turned off stay off after closing and reopening Preferences, and are saved to the profile', async () => {
		const session = texpile();
		const prefs = await opened(session);
		const all = ['Completion by mode', 'Argument hints', ...CHECKS.map((c) => c.label)];
		await prefs.open();
		await prefs.goTo('LaTeX');
		for (const label of all) await prefs.toggle(label);
		for (const label of all) await expect(prefs.switchFor(label), label).not.toBeChecked();
		await prefs.close();
		await prefs.open();
		await prefs.goTo('LaTeX');
		for (const label of all) await expect(prefs.switchFor(label), `${label} after reopening`).not.toBeChecked();
		await expect
			.poll(
				async () =>
					(await settingsOnDisk(session)) as { completionByMode?: boolean; argumentHints?: boolean; latexChecks?: Record<string, boolean> }
			)
			.toMatchObject({
				completionByMode: false,
				argumentHints: false,
				latexChecks: { 'undefined-command': false, engine: false, 'unknown-option': false, 'package-clash': false }
			});
		await prefs.close();
	});
});

test.describe('package files row', () => {
	test('the count follows a global file added while Preferences is open', async () => {
		const session = texpile();
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		fs.writeFileSync(path.join(session.userData, 'packages', 'gthree.json'), '{ "version": 1, "macros": [{ "name": "gthreecmd" }] }');
		await expect(prefs.row('package-files')).toContainText('1 in this folder - 3 for every folder', { timeout: 15_000 });
	});
});
