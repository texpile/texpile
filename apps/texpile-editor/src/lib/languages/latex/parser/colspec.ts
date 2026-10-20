// parse/generate the tabular colspec mini-language ({|l|c|p{3cm}|}) for the visual column editor.
// only the simple subset is modelled; anything exotic makes parseColspec return null so the UI
// falls back to editing the verbatim string. nothing is ever silently dropped.
import { commonRegistry, type RegistryItem } from '$lib/languages/latex/knowledge/registries/registries';

export type ColspecColumn = {
	align: string;
	width?: string; // a column that takes a {width}, like p
};

export type ColspecModel = {
	columns: ColspecColumn[];
	rules: boolean[]; // length === columns.length + 1; rules[i] = a `|` before column i; last = after
};

type ColumnTypes = readonly RegistryItem<'columnTypes'>[];
type ColumnKinds = { plain: Set<string>; sized: Set<string> };

const kindsCache = new WeakMap<ColumnTypes, ColumnKinds>();

// plain: a letter that takes nothing (l c r, tabularx X); sized: p and the types behaving like it (array's m b)
function kindsOf(types: ColumnTypes): ColumnKinds {
	let kinds = kindsCache.get(types);
	if (!kinds) {
		kinds = { plain: new Set(), sized: new Set() };
		for (const t of types) {
			if (t.name === '|') continue;
			if (!t.takes) kinds.plain.add(t.name);
			else if (t.takes === 'width' && (t.name === 'p' || t.like === 'p')) kinds.sized.add(t.name);
		}
		kindsCache.set(types, kinds);
	}
	return kinds;
}

/** `types` are the column types the document's files provide; the files most papers load when the caller has none */
export function parseColspec(spec: string, types: ColumnTypes = commonRegistry('columnTypes')): ColspecModel | null {
	const { plain, sized } = kindsOf(types);
	const columns: ColspecColumn[] = [];
	const rules: boolean[] = [];
	let pendingRule = false;
	let i = 0;
	while (i < spec.length) {
		const ch = spec[i];
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}
		if (ch === '|') {
			pendingRule = true;
			i++;
			continue;
		}
		if (plain.has(ch)) {
			rules.push(pendingRule);
			pendingRule = false;
			columns.push({ align: ch });
			i++;
			continue;
		}
		if (sized.has(ch)) {
			let j = i + 1;
			while (spec[j] === ' ') j++;
			if (spec[j] !== '{') return null; // a sized column is followed by {width}
			let depth = 0;
			let width = '';
			let k = j;
			for (; k < spec.length; k++) {
				const c = spec[k];
				if (c === '{') {
					depth++;
					if (depth === 1) continue;
				} else if (c === '}') {
					depth--;
					if (depth === 0) {
						k++;
						break;
					}
				}
				width += c;
			}
			if (depth !== 0) return null; // unbalanced braces
			rules.push(pendingRule);
			pendingRule = false;
			columns.push({ align: ch, width });
			i = k;
			continue;
		}
		return null; // not modelled: >{} @{} !{} *{} S(...) parens etc.
	}
	rules.push(pendingRule); // trailing rule after the last column
	return { columns, rules };
}

export function generateColspec(model: ColspecModel): string {
	let out = '';
	model.columns.forEach((col, i) => {
		if (model.rules[i]) out += '|';
		out += col.width === undefined ? col.align : `${col.align}{${col.width}}`;
	});
	if (model.rules[model.columns.length]) out += '|';
	return out;
}
