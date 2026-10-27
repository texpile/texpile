import { describe, it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState } from '@codemirror/state';
import { TreeFragment, type SyntaxNode, type Tree } from '@lezer/common';
import { parser } from '$lib/languages/latex/source/tree/parser';
import { modeFromTree } from '$lib/languages/latex/source/tree/treeMode';
import { keyListFromTree } from '$lib/languages/latex/source/tree/treeKeyList';
import { ownMathOf, setOwnMath } from '$lib/languages/latex/source/tree/ownMath';
import { extractUserDefinitions } from '$lib/languages/latex/intellisense/completion/userMacroScan';
import { isMathContext, modeAt } from '$lib/languages/latex/intellisense/completion/mathContext';
import { keysForEnv, keysForMacro } from '$lib/languages/latex/knowledge/keyCompletions';

const DIR = process.env.CORPUS_DIR;
const OUT = process.env.TREE_OUT ?? '/tmp/tree-compare';
const PER_FILE = Number(process.env.TREE_SAMPLES ?? 120);
const KEYVAL_BEFORE = /\\([a-zA-Z]+)[-+*/=!?:<>~^|]*((?:\[[^[\]{}]*\]|\{[^[\]{}]*\})*)([[{])[^[\]{}]*$/;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : f.endsWith('.tex') ? [p] : [];
	});
}

function random(seed: number) {
	let s = seed;
	return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function reasonAt(tree: Tree, pos: number): string {
	const names: string[] = [];
	for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent) names.push(n.name);
	return names.find((n) => n !== 'Text' && n !== 'ControlWord') ?? 'Document';
}

const snippet = (text: string, pos: number) => JSON.stringify(text.slice(Math.max(0, pos - 70), pos) + '|' + text.slice(pos, pos + 25));

describe.runIf(DIR)('syntax tree against the text scans', () => {
	it('compares', async () => {
		const files = walk(DIR!);
		const rnd = random(20261028);
		const mode: Record<string, number> = {};
		const math: Record<string, number> = {};
		const keys: Record<string, number> = {};
		const differ: string[] = [];
		const reasons: Record<string, number> = {};
		const mathDiffer: string[] = [];
		const mathWhy: Record<string, number> = {};
		const keyDiffer: string[] = [];
		let parseMs = 0;
		let bytes = 0;
		let scanMs = 0;
		let treeMs = 0;
		let lookups = 0;
		for (const path of files) {
			const text = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
			if (text.length > 600_000) continue;
			setOwnMath(ownMathOf(extractUserDefinitions(text)));
			const t0 = performance.now();
			const tree = parser.parse(text);
			parseMs += performance.now() - t0;
			bytes += text.length;
			const body = text.indexOf('\\begin{document}');
			const bodyStart = body < 0 ? 0 : body + 16;
			const state = EditorState.create({ doc: text });
			for (let k = 0; k < PER_FILE && text.length > bodyStart + 10; k++) {
				const pos = bodyStart + Math.floor(rnd() * (text.length - bodyStart));
				let s = performance.now();
				const old = modeAt(state, pos);
				const oldMath = isMathContext(state, pos);
				scanMs += performance.now() - s;
				s = performance.now();
				const now = modeFromTree(tree, text, pos, body < 0 ? 0 : bodyStart);
				treeMs += performance.now() - s;
				lookups++;
				mode[`${old}>${now}`] = (mode[`${old}>${now}`] ?? 0) + 1;
				math[`${oldMath}>${now === 'math'}`] = (math[`${oldMath}>${now === 'math'}`] ?? 0) + 1;
				if (oldMath && now !== 'math' && old !== null && mathDiffer.length < 600)
					mathDiffer.push(`${old}>${now} ${reasonAt(tree, pos)} ${path.slice(DIR!.length)} ${snippet(text, pos)}`);
				if (oldMath && now !== 'math')
					mathWhy[`${old}>${now} ${reasonAt(tree, pos)}`] = (mathWhy[`${old}>${now} ${reasonAt(tree, pos)}`] ?? 0) + 1;
				if (old !== null && old !== now) {
					const why = `${old}>${now} ${reasonAt(tree, pos)}`;
					reasons[why] = (reasons[why] ?? 0) + 1;
					if (differ.length < 1500) differ.push(`${why} ${path.slice(DIR!.length)} ${snippet(text, pos)}`);
				}
			}
			for (let k = 0; k < PER_FILE; k++) {
				const at = bodyStart + Math.floor(rnd() * Math.max(1, text.length - bodyStart));
				const next = text.slice(at).search(/[[{,=]/);
				if (next < 0) continue;
				const pos = at + next + 1;
				const line = text.lastIndexOf('\n', pos - 1) + 1;
				const found = KEYVAL_BEFORE.exec(text.slice(Math.max(line, pos - 250), pos));
				let m = found && !(['begin', 'end'].includes(found[1]) && !found[2]) ? found : null;
				if (m) {
					const typed = [...(m[2].match(/\[[^\]]*\]|\{[^}]*\}/g) ?? []), m[3]].map((g) => (g[0] === '[' ? '[]' : '{}'));
					const keyed =
						m[1] === 'begin'
							? await keysForEnv(/^\{([^{}]*)\}/.exec(m[2])?.[1] ?? '', typed.slice(1), [])
							: await keysForMacro(m[1], typed, []);
					if (!keyed) m = null;
				}
				let t = keyListFromTree(tree, text, pos);
				if (t) {
					const typed = [...t.typed, t.opener === '[' ? '[]' : '{}'];
					const keyed = t.environment !== undefined ? await keysForEnv(t.environment, typed, []) : await keysForMacro(t.command, typed, []);
					if (!keyed) t = null;
				}
				const inComment = tree.resolveInner(pos, -1).name === 'Comment';
				const kind =
					!m && !t
						? 'none'
						: m && t
							? m[1] === t.command && m[3] === t.opener
								? 'same'
								: 'different'
							: m
								? inComment
									? 'regex only, in a comment'
									: 'regex only'
								: 'tree only';
				keys[kind] = (keys[kind] ?? 0) + 1;
				if (kind !== 'none' && kind !== 'same' && keyDiffer.length < 400)
					keyDiffer.push(
						`${kind} regex=${m ? `${m[1]}${m[3]}` : '-'} tree=${t ? `${t.command}${t.opener}` : '-'} ${path.slice(DIR!.length)} ${snippet(text, pos)}`
					);
			}
		}
		const big = files
			.filter((f) => statSync(f).size > 150_000)
			.map((f) => readFileSync(f, 'utf8'))
			.join('\n\n')
			.slice(0, 2_000_000);
		let s = performance.now();
		const bigTree = parser.parse(big);
		const coldMs = performance.now() - s;
		const mid = Math.floor(big.length / 2);
		const edited = big.slice(0, mid) + 'x' + big.slice(mid);
		const fragments = TreeFragment.applyChanges(TreeFragment.addTree(bigTree), [{ fromA: mid, toA: mid, fromB: mid, toB: mid + 1 }]);
		s = performance.now();
		parser.parse(edited, fragments);
		const incrementalMs = performance.now() - s;
		const summary = {
			files: files.length,
			mode,
			reasons,
			mathWhy,
			math,
			keys,
			parse: { mbPerSecond: bytes / 1e6 / (parseMs / 1000), bigBytes: big.length, coldMs, incrementalMs },
			perLookupMs: { scans: scanMs / lookups, tree: treeMs / lookups }
		};
		writeFileSync(`${OUT}.json`, JSON.stringify(summary, null, 1));
		writeFileSync(`${OUT}-mode.txt`, differ.join('\n'));
		writeFileSync(`${OUT}-keys.txt`, keyDiffer.join('\n'));
		writeFileSync(`${OUT}-math.txt`, mathDiffer.join('\n'));
	}, 3_600_000);
});
