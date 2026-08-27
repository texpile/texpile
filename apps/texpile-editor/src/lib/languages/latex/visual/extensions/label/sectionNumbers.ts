import type { Node as PMNode } from 'prosemirror-model';

/**
 * The number each standalone label anchors, by label name.
 *
 * LaTeX's rule is that \label names the counter most recently incremented, so a label in running
 * prose still belongs to its section. Labels inside a list are the exception and are skipped: there
 * the counter is the item's, which this does not model, and a section number would be a wrong
 * answer rather than a missing one.
 *
 * These are the editor's own count, the same approximation the figure and table chips already
 * make. The compiler is the authority, and a starred heading advances nothing.
 */
export function sectionNumbers(doc: PMNode): Map<string, string> {
	const out = new Map<string, string>();
	const counters: number[] = [];
	let appendix = false;
	let current = '';

	function format(): string {
		const parts = counters.map((c) => c ?? 0);
		if (appendix && parts.length > 0) return [String.fromCharCode(64 + parts[0]), ...parts.slice(1)].join('.');
		return parts.join('.');
	}

	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			if (node.attrs.numbered === false) return false;
			const level = Math.max(1, Math.min(6, Number(node.attrs.level ?? 1)));
			counters.length = level;
			counters[level - 1] = (counters[level - 1] ?? 0) + 1;
			current = format();
			return false;
		}
		// \appendix restarts the top-level counter and letters it; it survives as a raw chip
		if ((node.type.name === 'raw_latex' || node.type.name === 'inline_latex') && node.textContent.trim() === '\\appendix') {
			appendix = true;
			counters.length = 0;
			current = '';
			return false;
		}
		if (node.type.name !== 'label' || !current) return;

		const $pos = doc.resolve(pos);
		for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'list') return;
		out.set(String(node.attrs.name ?? ''), current);
	});

	return out;
}
