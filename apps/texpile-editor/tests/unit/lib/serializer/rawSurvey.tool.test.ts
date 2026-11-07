// @vitest-environment jsdom
// which LaTeX the parser leaves as raw chips across a corpus of paper folders, tallied by the command or environment
// each chip starts with, with the number of papers that use it, and which of them the editor leaves as source (undrawn:
// no view of its own and no drawn face). Each paper parses with its own package table and macros, as the app does.
// Inert unless SURVEY_DIR points at a folder of paper folders; the report goes beside that folder, or to SURVEY_REPORT:
//
//   SURVEY_DIR=C:/dev/texpile-corpus-survey/papers pnpm --filter texpile-editor exec vitest run rawSurvey
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { blockChipView, inlineChipView } from '$lib/languages/latex/visual/extensions/chipViewKind';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { scanGlossary } from '$lib/languages/latex/intellisense/completion/glossary';
import { scanMacroDefinitions, scanRegisterDefinitions } from '$lib/editor/source/extensions/math-preview/userMacros';
import { definedHeads } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { forgetIndexedTexts } from '$lib/files/index/indexedTexts';
import { gatherProjectMacros } from '$lib/workspace/project';

const SURVEY = process.env.SURVEY_DIR;
const EXAMPLES = 6;

type HeadTally = {
	chips: number;
	block: number;
	inline: number;
	/** the chip is this one command with its arguments, or this one environment, and nothing else */
	alone: number;
	/** drawn by a view of its own (placeholder, frontmatter, a figure) or a drawn face; the rest shows as source */
	drawn: number;
	undrawnPapers: Set<string>;
	papers: Set<string>;
	/** papers that define this command themselves (\newcommand, \def, \newenvironment ...) */
	ownMacro: Set<string>;
	examples: Set<string>;
	/** the first argument of a chip that is the command alone, counted */
	firstArgs: Map<string, number>;
};

function listTex(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listTex(full));
		else if (entry.isFile() && /\.(tex|ltx)$/i.test(entry.name)) out.push(full);
	}
	return out;
}

function withoutLeadingSpace(text: string): string {
	return text.replace(/^(?:\s|%[^\n]*(?:\n|$))+/, '');
}

function headOf(text: string): string {
	const t = withoutLeadingSpace(text);
	if (!t) return 'comments only';
	const env = /^\\begin\s*\{([^}]+)\}/.exec(t);
	if (env) return `\\begin{${env[1]}}`;
	const macro = /^\\([a-zA-Z@]+\*?|.)/.exec(t);
	if (macro) return '\\' + macro[1];
	const group = /^\{\s*\\([a-zA-Z@]+)/.exec(t);
	if (group) return `{\\${group[1]} ...}`;
	if (t.startsWith('{')) return '{...}';
	if (t.startsWith('$')) return '$...$';
	return 'text';
}

/** index after the `{...}` or `[...]` group whose opener is at `i`, or -1 */
function closeOf(t: string, i: number): number {
	const square = t[i] === '[';
	let braces = 0;
	for (let j = i + 1; j < t.length; j++) {
		const c = t[j];
		if (c === '\\') j++;
		else if (c === '%') {
			j = t.indexOf('\n', j);
			if (j < 0) return -1;
		} else if (c === '{') braces++;
		else if (c === '}') {
			if (braces === 0) return square ? -1 : j + 1;
			braces--;
		} else if (square && c === ']' && braces === 0) return j + 1;
	}
	return -1;
}

function argsEnd(t: string, from: number): number {
	let i = from;
	for (;;) {
		let j = i;
		while (j < t.length && (t[j] === ' ' || t[j] === '\t' || (t[j] === '\n' && t[j + 1] !== '\n'))) j++;
		if (t[j] !== '{' && t[j] !== '[') return i;
		const end = closeOf(t, j);
		if (end < 0) return i;
		i = end;
	}
}

function isAlone(text: string): boolean {
	const t = withoutLeadingSpace(text).trimEnd();
	const env = /^\\begin\s*\{([^}]+)\}/.exec(t);
	if (env) {
		const close = `\\end{${env[1]}}`;
		return t.endsWith(close) && t.indexOf(close) === t.length - close.length;
	}
	const macro = /^\\([a-zA-Z@]+\*?|.)/.exec(t);
	if (!macro) return false;
	return withoutLeadingSpace(t.slice(argsEnd(t, macro[0].length))) === '';
}

function firstArgOf(text: string): string | null {
	const t = withoutLeadingSpace(text);
	const macro = /^\\([a-zA-Z@]+\*?)\s*/.exec(t);
	if (!macro) return null;
	let i = macro[0].length;
	if (t[i] === '[') i = closeOf(t, i);
	if (i < 0 || t[i] !== '{') return null;
	const end = closeOf(t, i);
	return end < 0
		? null
		: t
				.slice(i + 1, end - 1)
				.trim()
				.slice(0, 40);
}

/** the commands and environments a paper defines itself, over all of its files */
function ownDefinitionsOf(files: string[]): Set<string> {
	const own = new Set<string>();
	const pattern =
		/\\(?:(?:re)?newcommand\*?|providecommand\*?|DeclareRobustCommand\*?|DeclareMathOperator\*?)\s*\{?\s*\\([a-zA-Z@]+)|\\[gex]?def\s*\\([a-zA-Z@]+)|\\let\s*\\([a-zA-Z@]+)|\\(?:re)?newenvironment\*?\s*\{([^}]+)\}|\\newtheorem\*?\s*\{([^}]+)\}/g;
	for (const file of files)
		for (const m of fs.readFileSync(file, 'utf8').matchAll(pattern)) {
			const macro = m[1] ?? m[2] ?? m[3];
			const env = m[4] ?? m[5];
			if (macro) own.add('\\' + macro);
			if (env) own.add(`\\begin{${env}}`);
		}
	return own;
}

function isDrawn(text: string, block: boolean): boolean {
	if ((block ? blockChipView(text) : inlineChipView(text)) !== 'chip') return true;
	return latexFace(text, block) !== null;
}

function mainFileOf(files: string[]): string | null {
	return (
		files.find((file) => {
			const text = fs.readFileSync(file, 'utf8');
			return /\\documentclass/.test(text) && text.includes('\\begin{document}');
		}) ?? null
	);
}

/** the project scan the app runs for the open folder: the style files a paper ships give their macros to every chip */
async function scanProject(dir: string, files: string[]): Promise<void> {
	const main = mainFileOf(files);
	forgetIndexedTexts();
	const texFiles = files.map((file) => ({ name: path.basename(file), path: file, relPath: path.relative(dir, file) }));
	await refreshProjectIntel(texFiles, [], null, main, async (file) => fs.readFileSync(file, 'utf8'), null, main);
}

/** the main file's preamble and what its include chain reads, as the app passes every file of the folder */
async function projectMacrosOf(dir: string, files: string[]): Promise<string> {
	const main = mainFileOf(files);
	if (!main) return '';
	return gatherProjectMacros(main, dir, async (file) => fs.readFileSync(file, 'utf8'));
}

it.skipIf(!SURVEY)(
	'surveys the raw chips of a corpus',
	async () => {
		const root = SURVEY as string;
		const heads = new Map<string, HeadTally>();
		const inside = new Map<string, Set<string>>();
		const totals = {
			papers: 0,
			files: 0,
			failed: 0,
			textblocks: 0,
			blockChips: 0,
			inlineChips: 0,
			undrawnBlock: 0,
			undrawnInline: 0,
			rawChars: 0,
			bodyChars: 0
		};
		const papersPerChips: Array<[string, number]> = [];
		const undrawnPerPaper: Array<[string, string[]]> = [];

		for (const paper of fs.readdirSync(root).sort()) {
			const dir = path.join(root, paper);
			if (!fs.statSync(dir).isDirectory()) continue;
			const files = listTex(dir);
			if (!files.length) continue;
			totals.papers++;
			const macros = await projectMacrosOf(dir, files);
			const own = ownDefinitionsOf(files);
			await scanProject(dir, files);
			const table = packageTableOf(await parsedPackages(macros));
			documentTable.current = table;
			let chipsHere = 0;
			const undrawnHere: string[] = [];
			for (const file of files) {
				const source = fs.readFileSync(file, 'utf8');
				let parsed;
				try {
					parsed = parseLatexFile(source, macros, undefined, table);
				} catch {
					totals.failed++;
					continue;
				}
				totals.files++;
				templateFeaturesStore.current = {
					...templateFeaturesStore.current,
					macros: scanMacroDefinitions(macros + source),
					registers: scanRegisterDefinitions(macros + source),
					glossary: scanGlossary(macros + source, []),
					environmentHeads: definedHeads(macros)
				};
				parsed.doc.descendants((node) => {
					if (node.isTextblock) totals.textblocks++;
					if (node.type.name !== 'raw_latex' && node.type.name !== 'inline_latex') return true;
					const text = node.textContent;
					if (!text.trim()) return false;
					chipsHere++;
					totals.rawChars += text.length;
					const block = node.type.name === 'raw_latex';
					if (block) totals.blockChips++;
					else totals.inlineChips++;
					const head = headOf(text);
					const tally = heads.get(head) ?? {
						chips: 0,
						block: 0,
						inline: 0,
						alone: 0,
						drawn: 0,
						undrawnPapers: new Set<string>(),
						papers: new Set<string>(),
						ownMacro: new Set<string>(),
						examples: new Set<string>(),
						firstArgs: new Map<string, number>()
					};
					tally.chips++;
					if (block) tally.block++;
					else tally.inline++;
					if (isAlone(text)) {
						tally.alone++;
						const arg = firstArgOf(text);
						if (arg !== null) tally.firstArgs.set(arg, (tally.firstArgs.get(arg) ?? 0) + 1);
					}
					if (isDrawn(text, block)) tally.drawn++;
					else {
						tally.undrawnPapers.add(paper);
						if (block) totals.undrawnBlock++;
						else totals.undrawnInline++;
						undrawnHere.push(withoutLeadingSpace(text).replace(/\s+/g, ' ').slice(0, 70));
					}
					if (own.has(head.replace(/\*$/, ''))) tally.ownMacro.add(paper);
					tally.papers.add(paper);
					if (tally.examples.size < EXAMPLES) tally.examples.add(withoutLeadingSpace(text).replace(/\s+/g, ' ').slice(0, 90));
					heads.set(head, tally);
					for (const m of text.matchAll(/\\([a-zA-Z@]+\*?)/g)) {
						const seen = inside.get('\\' + m[1]) ?? new Set<string>();
						seen.add(paper);
						inside.set('\\' + m[1], seen);
					}
					return false;
				});
				totals.bodyChars += parsed.doc.textContent.length;
			}
			papersPerChips.push([paper, chipsHere]);
			undrawnPerPaper.push([paper, undrawnHere]);
		}

		const rows = [...heads].sort(
			(a, b) => b[1].undrawnPapers.size - a[1].undrawnPapers.size || b[1].chips - b[1].drawn - (a[1].chips - a[1].drawn)
		);
		const cell = (e: string) => '`' + e.replace(/`/g, "'").replace(/\|/g, '\\|') + '`';
		const topArgs = (t: HeadTally) =>
			[...t.firstArgs]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 6)
				.map(([a, n]) => `${cell(a)} ${n}`)
				.join(', ');
		const table = rows.map(
			([head, t]) =>
				`| \`${head}\` | ${t.undrawnPapers.size} | ${t.chips - t.drawn} | ${t.papers.size} | ${t.ownMacro.size || ''} | ${t.chips} | ${t.block} | ${t.inline} | ${Math.round((100 * t.alone) / t.chips)}% | ${topArgs(t)} | ${[...t.examples].slice(0, 2).map(cell).join('<br>')} |`
		);
		const insideRows = [...inside].sort((a, b) => b[1].size - a[1].size).slice(0, 120);
		const report = [
			`# Raw chips across ${totals.papers} papers`,
			'',
			`files parsed ${totals.files}, failed ${totals.failed}; textblocks ${totals.textblocks}; block chips ${totals.blockChips}, inline chips ${totals.inlineChips}; undrawn ${totals.undrawnBlock} block, ${totals.undrawnInline} inline; papers with none undrawn ${undrawnPerPaper.filter(([, u]) => !u.length).length} of ${totals.papers}; raw text ${totals.rawChars} of ${totals.bodyChars} body characters (${((100 * totals.rawChars) / Math.max(1, totals.bodyChars)).toFixed(1)}%)`,
			'',
			'## By what the chip starts with',
			'',
			'| starts with | papers undrawn in | undrawn | papers | own macro in | chips | block | inline | alone | first arguments | examples |',
			'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
			...table,
			'',
			'## Commands anywhere inside a chip, by papers',
			'',
			insideRows.map(([m, p]) => `\`${m}\` ${p.size}`).join(', '),
			'',
			'## Chips per paper',
			'',
			papersPerChips.map(([p, n]) => `${p} ${n}`).join(', '),
			'',
			'## Undrawn chips per paper',
			'',
			...undrawnPerPaper
				.sort((a, b) => b[1].length - a[1].length)
				.map(([p, u]) => `- ${p} ${u.length}${u.length ? ': ' + u.slice(0, 4).map(cell).join(', ') : ''}`)
		].join('\n');
		const out = process.env.SURVEY_REPORT ?? path.join(path.dirname(root), 'report');
		fs.mkdirSync(out, { recursive: true });
		fs.writeFileSync(path.join(out, 'raw-survey.md'), report);
		fs.writeFileSync(
			path.join(out, 'raw-survey.json'),
			JSON.stringify(
				{
					totals,
					undrawn: Object.fromEntries(undrawnPerPaper),
					heads: rows.map(([h, t]) => ({
						head: h,
						...t,
						papers: [...t.papers],
						undrawnPapers: [...t.undrawnPapers],
						ownMacro: [...t.ownMacro],
						examples: [...t.examples],
						firstArgs: Object.fromEntries(t.firstArgs)
					}))
				},
				null,
				1
			)
		);
		console.log(report.split('\n').slice(0, 90).join('\n'));
	},
	60 * 60 * 1000
);
