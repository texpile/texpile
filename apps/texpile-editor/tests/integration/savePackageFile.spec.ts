import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPaletteCommand } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';

// the TeX that drafts the file: TEXPILE_TEST_TEX_BIN, else the lualatex on PATH, else the spec is skipped
function texBin(): string | null {
	if (process.env.TEXPILE_TEST_TEX_BIN) return process.env.TEXPILE_TEST_TEX_BIN;
	try {
		const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['lualatex'], { encoding: 'utf8' });
		return path.dirname(found.split(/\r?\n/)[0].trim());
	} catch {
		return null;
	}
}
const TEX = texBin();

// a package no data covers, installed where kpsewhich finds it
const STY = String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{zzlabtools}[2026/10/20 lab tools]
\NewDocumentCommand\zzlabnote{o m}{\textbf{#2}}
\newcommand\zzlabmark{X}
\newcommand\zzlabpair[2]{#1--#2}
\newenvironment{zzlabbox}{\begin{quote}}{\end{quote}}
\endinput
`;
const texmf = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-it-texmf-'));
fs.mkdirSync(path.join(texmf, 'tex/latex/zzlabtools'), { recursive: true });
fs.writeFileSync(path.join(texmf, 'tex/latex/zzlabtools/zzlabtools.sty'), STY);
test.afterAll(() => fs.rmSync(texmf, { recursive: true, force: true }));

const LAB = '\\documentclass{article}\n\\usepackage{zzlabtools}\n\\begin{document}\nLab notes.\n\\end{document}\n';
const texpile = useTexpile({
	files: { 'lab.tex': LAB },
	// the folder Preferences puts in front of PATH, as a reader whose TeX is not on their shell's PATH sets it
	settings: TEX ? { toolDirs: [TEX] } : {},
	env: { TEXMFHOME: texmf }
});
test.skip(!TEX, 'needs lualatex: put it on PATH or set TEXPILE_TEST_TEX_BIN');

const FILE = '.texpile/packages/zzlabtools.json';

test('the draft holds what TeX reports, and opens with the folder bar over it', async () => {
	const { page, source } = texpile();
	await source.open('lab.tex');
	await runPaletteCommand(page, 'Save Package File for zzlabtools');
	await expect.poll(() => fs.existsSync(source.path(FILE)), { timeout: 60_000, message: 'the drafted file' }).toBe(true);
	const draft = JSON.parse(fs.readFileSync(source.path(FILE), 'utf8'));
	expect(draft.version).toBe(1);
	const macros = Object.fromEntries((draft.macros ?? []).map((m: { name: string; args?: { kind: string }[] }) => [m.name, m.args ?? []]));
	expect(macros.zzlabnote?.map((a: { kind: string }) => a.kind)).toEqual(['o', 'm']);
	expect(macros.zzlabpair?.map((a: { kind: string }) => a.kind)).toEqual(['m', 'm']);
	expect(macros.zzlabmark).toEqual([]);
	expect((draft.envs ?? []).map((e: { name: string }) => e.name)).toContain('zzlabbox');
	// what the package loads to do its work is no command of its own
	expect(Object.keys(macros)).not.toContain('textbf');
	await expect(page.getByText(/package file in this folder|Commands for the zzlabtools package in this folder/i).first()).toBeVisible();
	// shared with collaborators through Git, as folder package files are
	expect(fs.readFileSync(source.path('.texpile/.gitignore'), 'utf8')).toContain('!packages/*.json');
});
