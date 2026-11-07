// the \label keys and \bibitem entries of a text, read by the argument roles of the package data
import { codeOnly } from '../texCode';
import { bibliographyEnvsIn } from '../knowledge/environments/bibliographyEnvironment';
import { keysIn } from '../knowledge/calls/roleKeys';
import { latexTreeOf } from '../syntax/latexTrees';
import { innermostEnvironmentAt } from '../syntax/innermostEnvironment';

export type BibItemSlice = {
	key: string;
	/** The entry's free text: source after the `\bibitem[…]{…}` head, up to the next entry. */
	body: string;
	command: string;
	head: (string | null)[];
	number: number;
};

export function extractDocRefs(latex: string): { labels: string[]; bibitems: BibItemSlice[] } {
	const code = codeOnly(latex);
	const labels = new Set(keysIn(code, 'label', true).map((d) => d.key));
	const items = keysIn(code, 'citekey', true).sort((a, b) => a.call.at - b.call.at);
	const bibitems: BibItemSlice[] = [];
	const seen = new Set<string>();
	const lists = bibliographyEnvsIn(latex);
	let number = 0;
	let counted: unknown = null;
	items.forEach((item, i) => {
		if (seen.has(item.key)) return;
		seen.add(item.key);
		const next = i + 1 < items.length ? items[i + 1].call.at : latex.length;
		const list = lists.find((l) => l.from <= item.call.at && item.call.at < l.end);
		number = list === counted ? number + 1 : 1;
		counted = list;
		const keyArg = item.call.args.find((a) => a.values.some((v) => v.at === item.at));
		const head = Array.from({ length: keyArg?.index ?? 0 }, (_, index) => {
			const arg = item.call.args.find((a) => a.index === index);
			return arg ? latex.slice(arg.from, arg.to) : null;
		});
		const body = latex.slice(item.call.end, list ? Math.min(next, list.end) : next);
		bibitems.push({ key: item.key, body, command: item.command, head, number });
	});
	return { labels: [...labels], bibitems };
}

/** \label keys only, for \ref/\cref autocompletion. */
export function extractLabels(latex: string): string[] {
	return extractDocRefs(latex).labels;
}

export type ChipLabel = { label: string; env: string | null };

export function extractChipLabels(latex: string): ChipLabel[] {
	const code = codeOnly(latex);
	const tree = latexTreeOf(code);
	const seen = new Set<string>();
	const out: ChipLabel[] = [];
	for (const { key, at } of keysIn(code, 'label', true)) {
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ label: key, env: innermostEnvironmentAt(tree, code, at)?.name ?? null });
	}
	return out;
}
