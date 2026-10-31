import { pictureAround, type CetzStatement } from '../picture';

/** a name no element has yet: n1, n2 ... */
export function freshName(source: string) {
	let k = 1;
	while (source.includes(`"n${k}"`)) k++;
	return `n${k}`;
}

/** a state's name no element has yet: q0, q1 ... */
export function freshStateName(source: string) {
	let k = 0;
	while (source.includes(`"q${k}"`)) k++;
	return `q${k}`;
}

/** where a statement's name is written: `name: "a"`, or a finite state's second argument */
export function nameArg(st: CetzStatement) {
	return st.command === 'finite-state' ? (st.args.filter((a) => !a.name)[1] ?? null) : (st.args.find((a) => a.name === 'name') ?? null);
}

/** `content(..., name: "a")`, the name a line can point at */
export function nodeName(source: string, st: CetzStatement) {
	const arg = nameArg(st);
	const m = arg && /^"([^"]*)"$/.exec(source.slice(arg.value.from, arg.value.to));
	return m ? m[1] : null;
}

/** inside a `group`, whose names are its own: what is outside it cannot point at them */
function grouped(source: string, st: CetzStatement) {
	const statements = pictureAround(source, st)?.picture.statements ?? [];
	return statements.some((g) => g.command === 'group' && g.i !== st.i && g.from <= st.from && st.to <= g.to);
}

/** an element something can point at: its own name, or `name: "n1"`, `"n2"` ... added to it; null for one inside a
 *  group, which keeps its names to itself */
export function ensureNodeName(source: string, st: CetzStatement): { source: string; name: string } | null {
	if (grouped(source, st)) return null;
	const existing = nodeName(source, st);
	if (existing) return { source, name: existing };
	const name = freshName(source);
	const last = st.args.at(-1);
	const at = last ? last.to : st.close;
	return { source: `${source.slice(0, at)}${last ? ', ' : ''}name: "${name}"${source.slice(at)}`, name };
}
