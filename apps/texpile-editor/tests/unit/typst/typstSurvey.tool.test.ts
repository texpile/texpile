// @vitest-environment jsdom
// which Typst the visual editor leaves as raw chips across a corpus of paper folders, tallied by what each chip starts
// with (the function it calls, the rule and its target, #let, #import, a kind of markup), with whose the function is (the
// paper's own, a package's, Typst's), and which of them show as source. Each .typ file opens as the app opens it
// (parseTypstFile reads the file alone), its calls drawn by the packages it imports and the lets of its project. Slide decks are left out, and chips in module files (only ever imported) are
// counted apart as well as in the tables. Inert unless SURVEY_DIR points at a folder of paper folders; packages are read
// from SURVEY_PACKAGES (Typst's package cache layout, default a `packages` folder beside SURVEY_DIR), the report goes to
// SURVEY_REPORT (default `report` beside SURVEY_DIR):
//
//   SURVEY_DIR=/home/user/corpus-typst/papers pnpm --filter texpile-editor exec vitest run typstSurvey
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { isTypstBibliography } from '$lib/languages/typst/visual/extensions/typstBibliographyView.svelte';
import { isFigureBlock } from '$lib/draw/host/card/FigureCardView.svelte';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { chipStatements, isAlone, type ChipStatement } from './survey/typstSurveyHeads';
import { listTyp, paperNames, type NameOrigin } from './survey/typstSurveyOrigins';
import { fileRoles } from './survey/typstSurveyFiles';
import { mainFileOf, packageCacheAt, projectAt } from './survey/typstSurveyPackages';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

const SURVEY = process.env.SURVEY_DIR;
const EXAMPLES = 6;

type Tally = {
	chips: number;
	block: number;
	inline: number;
	alone: number;
	drawn: number;
	undrawnInModules: number;
	undrawnPapers: Set<string>;
	papers: Set<string>;
	origins: Map<string, number>;
	/** a set rule's arguments, an import's path, a let's names; for a kind, the heads in it */
	details: Map<string, number>;
	examples: Set<string>;
};

type Chip = { text: string; block: boolean; drawn: boolean; alone: boolean; paper: string; module: boolean; origin: NameOrigin | null };

/** the choice typstNodeViews makes: a block chip is a bibliography card, a CeTZ figure card or a drawn face */
function isDrawn(text: string, block: boolean): boolean {
	if (block && (isTypstBibliography(text) || isFigureBlock(cetzLanguage, text))) return true;
	return typstFace(text) !== null;
}

/** a head with the paper's and the packages' own names put together, so a template's `#show: conf.with(..)` and
 *  another's `#show: project.with(..)` count as one thing */
function kindOf(statement: ChipStatement, origin: NameOrigin | null): string {
	const { head } = statement;
	if (head.startsWith('#import @')) return '#import package';
	const whose = origin === 'own' ? 'own' : origin?.startsWith('package') ? 'package' : null;
	if (head.startsWith('#show: ')) return whose ? `#show: ${whose} function` : head.replace(/\.with\(\.\.\)$/, '');
	if (head.startsWith('#let') || head.startsWith('#set') || head.startsWith('#show') || head.startsWith('markup')) return head;
	if (!whose) return head;
	return head.endsWith('(..)') ? `#${whose} function call` : `#${whose} value`;
}

function oneLine(text: string, length: number): string {
	return text.trim().replace(/\s+/g, ' ').slice(0, length);
}

function bump<K>(map: Map<K, number>, key: K): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function tallyOf(map: Map<string, Tally>, key: string): Tally {
	let tally = map.get(key);
	if (!tally) {
		tally = {
			chips: 0,
			block: 0,
			inline: 0,
			alone: 0,
			drawn: 0,
			undrawnInModules: 0,
			undrawnPapers: new Set(),
			papers: new Set(),
			origins: new Map(),
			details: new Map(),
			examples: new Set()
		};
		map.set(key, tally);
	}
	return tally;
}

function count(tally: Tally, chip: Chip, detail: string): void {
	tally.chips++;
	if (chip.block) tally.block++;
	else tally.inline++;
	if (chip.alone) tally.alone++;
	if (detail) bump(tally.details, oneLine(detail, 40));
	if (chip.origin) bump(tally.origins, chip.origin);
	tally.papers.add(chip.paper);
	if (chip.drawn) tally.drawn++;
	else tally.undrawnPapers.add(chip.paper);
	if (!chip.drawn && chip.module) tally.undrawnInModules++;
	if (!chip.drawn && tally.examples.size < EXAMPLES) tally.examples.add(oneLine(chip.text, 90));
}

const cell = (e: string) => '`' + e.replace(/`/g, "'").replace(/\|/g, '\\|') + '`';

function topOf(map: Map<string, number>, n: number, quote = true): string {
	return [...map]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([key, n2]) => `${quote ? cell(key) : key} ${n2}`)
		.join(', ');
}

function tableOf(map: Map<string, Tally>, title: string, detail: string): string[] {
	const rows = [...map].sort(
		(a, b) => b[1].undrawnPapers.size - a[1].undrawnPapers.size || b[1].chips - b[1].drawn - (a[1].chips - a[1].drawn)
	);
	return [
		`| ${title} | papers undrawn in | undrawn | in modules | papers | chips | block | inline | alone | whose | ${detail} | undrawn examples |`,
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map(
			([head, t]) =>
				`| ${cell(head)} | ${t.undrawnPapers.size} | ${t.chips - t.drawn} | ${t.undrawnInModules} | ${t.papers.size} | ${t.chips} | ${t.block} | ${t.inline} | ${Math.round((100 * t.alone) / t.chips)}% | ${topOf(t.origins, 3, false)} | ${topOf(t.details, 5)} | ${[...t.examples].slice(0, 2).map(cell).join('<br>')} |`
		)
	];
}

function jsonOf(map: Map<string, Tally>) {
	return [...map].map(([head, t]) => ({
		head,
		...t,
		papers: [...t.papers],
		undrawnPapers: [...t.undrawnPapers],
		origins: Object.fromEntries(t.origins),
		details: Object.fromEntries(t.details),
		examples: [...t.examples]
	}));
}

it.skipIf(!SURVEY)(
	'surveys the raw chips of a Typst corpus',
	async () => {
		const root = SURVEY as string;
		const packages = process.env.SURVEY_PACKAGES ?? path.join(path.dirname(root), 'packages');
		const cache = packageCacheAt(packages);
		const heads = new Map<string, Tally>();
		const kinds = new Map<string, Tally>();
		const inside = new Map<string, Set<string>>();
		const originTotals = new Map<string, number>();
		const totals = {
			papers: 0,
			files: 0,
			moduleFiles: 0,
			slideFiles: 0,
			moduleUndrawn: 0,
			failed: 0,
			textblocks: 0,
			blockChips: 0,
			inlineChips: 0,
			undrawnBlock: 0,
			undrawnInline: 0
		};
		const extra = { rawChars: 0, bodyChars: 0 };
		const undrawnPerPaper: Array<[string, string[]]> = [];
		const chipsPerPaper: Array<[string, number]> = [];
		const missing = new Map<string, Set<string>>();
		const failures: string[] = [];
		const slideFiles: string[] = [];
		const undrawnChips: Array<{ paper: string; file: string; block: boolean; head: string; text: string }> = [];

		for (const paper of fs.readdirSync(root).sort()) {
			const dir = path.join(root, paper);
			if (!fs.statSync(dir).isDirectory()) continue;
			const roles = fileRoles(dir, listTyp(dir), packages);
			const files = [...roles.keys()].filter((file) => roles.get(file) !== 'slides');
			for (const [file, role] of roles) if (role === 'slides') totals.slideFiles = slideFiles.push(path.relative(root, file));
			if (!files.length) continue;
			totals.papers++;
			const names = paperNames(files, packages);
			const main = await mainFileOf(dir, listTyp(dir));
			for (const spec of names.missingPackages) (missing.get(spec) ?? missing.set(spec, new Set()).get(spec)!).add(paper);
			const undrawnHere: string[] = [];
			let chipsHere = 0;
			for (const file of files) {
				const source = fs.readFileSync(file, 'utf8');
				typstScopeNow.current = await scopeOfFile(source, cache, projectAt(dir, file, main));
				let doc;
				try {
					doc = parseTypstFile(source).doc;
				} catch (e) {
					totals.failed++;
					failures.push(`${path.relative(root, file)}: ${e instanceof Error ? e.message : String(e)}`);
					continue;
				}
				totals.files++;
				const module = roles.get(file) === 'module';
				if (module) totals.moduleFiles++;
				doc.descendants((node) => {
					if (node.isTextblock && node.type.name !== 'raw_latex') totals.textblocks++;
					if (node.type.name !== 'raw_latex' && node.type.name !== 'inline_latex') return true;
					const text = node.textContent;
					if (!text.trim()) return false;
					chipsHere++;
					extra.rawChars += text.length;
					const block = node.type.name === 'raw_latex';
					const statements = chipStatements(text);
					const first = statements[0] ?? { head: 'comments only', root: null, detail: '' };
					const origin = names.origin(first.root);
					const chip: Chip = { text, block, drawn: isDrawn(text, block), alone: isAlone(statements), paper, module, origin };
					count(tallyOf(heads, first.head), chip, first.detail);
					count(tallyOf(kinds, kindOf(first, origin)), chip, first.head);
					if (block) totals.blockChips++;
					else totals.inlineChips++;
					if (!chip.drawn) {
						if (module) totals.moduleUndrawn++;
						if (block) totals.undrawnBlock++;
						else totals.undrawnInline++;
						undrawnHere.push(oneLine(text, 70));
						undrawnChips.push({ paper, file: path.relative(dir, file), block, head: first.head, text: text.slice(0, 1500) });
						for (const s of statements) {
							const whose = names.origin(s.root);
							if (whose) bump(originTotals, whose.startsWith('package') ? 'package' : whose);
						}
					}
					for (const s of statements) (inside.get(s.head) ?? inside.set(s.head, new Set()).get(s.head)!).add(paper);
					return false;
				});
				extra.bodyChars += doc.textContent.length;
			}
			chipsPerPaper.push([paper, chipsHere]);
			undrawnPerPaper.push([paper, undrawnHere]);
		}

		const clean = undrawnPerPaper.filter(([, u]) => !u.length).length;
		const report = [
			`# Typst raw chips across ${totals.papers} papers`,
			'',
			`files parsed ${totals.files} (${totals.moduleFiles} modules), slide files left out ${totals.slideFiles}, failed ${totals.failed}; textblocks ${totals.textblocks}; block chips ${totals.blockChips}, inline chips ${totals.inlineChips}; undrawn ${totals.undrawnBlock} block, ${totals.undrawnInline} inline (${totals.moduleUndrawn} in modules); papers with none undrawn ${clean} of ${totals.papers}; raw text ${extra.rawChars} of ${extra.bodyChars} body characters (${((100 * extra.rawChars) / Math.max(1, extra.bodyChars)).toFixed(1)}%)`,
			'',
			`calls and reads in undrawn chips by whose the name is: ${topOf(originTotals, 5, false)}`,
			'',
			"## By kind (the paper's and the packages' functions put together)",
			'',
			...tableOf(kinds, 'kind', 'heads'),
			'',
			'## By what the chip starts with',
			'',
			...tableOf(heads, 'starts with', 'details'),
			'',
			'## Statements anywhere in a chip, by papers',
			'',
			[...inside]
				.sort((a, b) => b[1].size - a[1].size)
				.slice(0, 150)
				.map(([h, p]) => `${cell(h)} ${p.size}`)
				.join(', '),
			'',
			'## Packages imported but not in the package folder',
			'',
			[...missing].map(([spec, p]) => `${cell(spec)} ${p.size}`).join(', ') || 'none',
			'',
			'## Slide files left out',
			'',
			slideFiles.map((f) => `- ${f}`).join('\n') || 'none',
			'',
			'## Files that failed to parse',
			'',
			failures.map((f) => `- ${f}`).join('\n') || 'none',
			'',
			'## Chips per paper',
			'',
			chipsPerPaper.map(([p, n]) => `${p} ${n}`).join(', '),
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
		const json = {
			totals: { ...totals, ...extra, clean },
			undrawn: Object.fromEntries(undrawnPerPaper),
			kinds: jsonOf(kinds),
			heads: jsonOf(heads)
		};
		fs.writeFileSync(path.join(out, 'undrawn-chips.json'), JSON.stringify(undrawnChips, null, 1));
		fs.writeFileSync(path.join(out, 'raw-survey.json'), JSON.stringify(json, null, 1));
	},
	60 * 60 * 1000
);
