import { pictureAround, type CetzStatement } from '../picture';

export function freshName(source: string) {
	let k = 1;
	while (source.includes(`"n${k}"`)) k++;
	return `n${k}`;
}

export function freshStateName(source: string) {
	let k = 0;
	while (source.includes(`"q${k}"`)) k++;
	return `q${k}`;
}

export function nameArg(st: CetzStatement) {
	return st.command === 'finite-state' ? (st.args.filter((a) => !a.name)[1] ?? null) : (st.args.find((a) => a.name === 'name') ?? null);
}

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

export function ensureNodeName(source: string, st: CetzStatement): { source: string; name: string } | null {
	if (grouped(source, st)) return null;
	const existing = nodeName(source, st);
	if (existing) return { source, name: existing };
	const name = freshName(source);
	const last = st.args.at(-1);
	const at = last ? last.to : st.close;
	return { source: `${source.slice(0, at)}${last ? ', ' : ''}name: "${name}"${source.slice(at)}`, name };
}
