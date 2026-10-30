// how deeply the groups, environments and conditionals of a TeX text enclose a position
import { commonFacts } from '../../knowledge/commands/commandFacts';
import { latexTreeOf } from '../../syntax/latexTrees';

type DepthToken = { at: number; step: 1 | -1 | 0; name: string };

const UNREAD = new Set(['Comment', 'Verb', 'VerbatimEnvironment', 'UrlArgument']);

function namesDocument(token: string): boolean {
	return /^\\(?:begin|end)\s*\{\s*document\s*\}$/.test(token);
}

function depthTokensOf(text: string): DepthToken[] {
	const out: DepthToken[] = [];
	latexTreeOf(text).iterate({
		enter(n) {
			if (UNREAD.has(n.name)) return false;
			if (n.name === '{') out.push({ at: n.from, step: 1, name: '' });
			else if (n.name === '}' || n.name === 'StrayClose') out.push({ at: n.from, step: -1, name: '' });
			else if (n.name === 'BeginEnv' || n.name === 'EndEnv' || n.name === 'StrayEnd') {
				const document = namesDocument(text.slice(n.from, n.to));
				out.push({ at: n.from, step: document ? 0 : n.name === 'BeginEnv' ? 1 : -1, name: '' });
			} else if (n.name === 'ControlWord') out.push({ at: n.from, step: 0, name: text.slice(n.from + 1, n.to) });
			else if (n.name === 'ControlSymbol') out.push({ at: n.from, step: 0, name: '' });
			else if (n.name === 'Skipped') {
				out.push({ at: n.from, step: 1, name: '' });
				if (text.endsWith('\\fi', n.to)) out.push({ at: n.to - 3, step: -1, name: '' });
				return false;
			}
		}
	});
	return out;
}

/** how deeply a group, an environment or a conditional encloses each position */
export function groupDepthsAt(text: string, positions: number[]): number[] {
	const tokens = depthTokensOf(text);
	const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b]);
	const own = new Set(tokens.filter((t, i) => tokens[i - 1]?.name === 'newif' && t.name.startsWith('if')).map((t) => t.name));
	const out = positions.map(() => 0);
	let depth = 0;
	let next = 0;
	tokens.forEach((t, i) => {
		while (next < order.length && positions[order[next]] <= t.at) out[order[next++]] = depth;
		const before = tokens[i - 1]?.name ?? '';
		const name = t.name;
		if (t.step === 1 || name === 'begingroup') depth++;
		else if (t.step === -1 || name === 'endgroup' || name === 'fi') depth = Math.max(0, depth - 1);
		// a conditional named by \newif or \let opens nothing
		else if (name && (commonFacts(name).conditional || own.has(name)) && !/^(?:newif|let)$/.test(before) && tokens[i - 2]?.name !== 'let')
			depth++;
	});
	while (next < order.length) out[order[next++]] = depth;
	return out;
}
