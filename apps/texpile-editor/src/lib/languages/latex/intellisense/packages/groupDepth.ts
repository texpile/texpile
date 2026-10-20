// how deeply the groups, environments and conditionals of a TeX text enclose a position
import { commonFacts } from '../../knowledge/commands/commandFacts';

const GROUPING = /\\(?:begin\s*\{([^{}]*)\}|end\s*\{([^{}]*)\}|([A-Za-z@]+)|[^])|[{}]/g;

/** how deeply a group, an environment or a conditional encloses each position */
export function groupDepthsAt(code: string, positions: number[]): number[] {
	const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b]);
	const own = new Set([...code.matchAll(/\\newif\s*\\(if[A-Za-z@]+)/g)].map((m) => m[1]));
	const out = positions.map(() => 0);
	let depth = 0;
	let next = 0;
	let before = '';
	let beforeThat = '';
	for (const t of code.matchAll(GROUPING)) {
		while (next < order.length && positions[order[next]] <= t.index) out[order[next++]] = depth;
		const name = t[3];
		if (t[0] === '{' || (t[1] !== undefined && t[1].trim() !== 'document')) depth++;
		else if (t[0] === '}' || (t[2] !== undefined && t[2].trim() !== 'document')) depth = Math.max(0, depth - 1);
		else if (name === 'begingroup') depth++;
		else if (name === 'endgroup' || name === 'fi') depth = Math.max(0, depth - 1);
		// a conditional named by \newif or \let opens nothing
		else if (name && (commonFacts(name).conditional || own.has(name)) && !/^(?:newif|let)$/.test(before) && beforeThat !== 'let') depth++;
		beforeThat = before;
		before = name ?? '';
	}
	while (next < order.length) out[order[next++]] = depth;
	return out;
}
