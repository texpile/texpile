// what a reader sees of a document, line by line: the words of every block with the marks on
// them, the blocks' kinds and nesting, and the atoms among them, in a form that is the same for
// a document as the editor holds it and for the one its saved file parses to again. The two
// laws a save must keep (see blockAssembly.ts) are checked on this, since a file's bytes may
// legitimately differ from what the editor would write for them
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { formatImage } from '$lib/languages/markdown/visual/inlineSyntax';

export type VisualFormat = 'tex' | 'md' | 'typ';

type Cell = { ch: string; marks: string[] };

export function visibleLines(doc: PMNode, format: VisualFormat): string[] {
	const lines: string[] = [];
	function cellsOf(node: PMNode): Cell[] {
		const plain = format === 'md' && node.type.name === 'image';
		const cells: Cell[] = [];
		node.forEach((child) => {
			if (child.isText) {
				for (const ch of child.text!) {
					const space = /\s/.test(ch);
					const marks = plain || space ? [] : child.marks.map((m) => (m.type.name === 'link' ? `link(${m.attrs.href})` : m.type.name));
					cells.push({ ch: space ? ' ' : ch, marks });
				}
			} else if (child.type.name === 'hard_break') {
				cells.push({ ch: plain ? ' ' : '⏎', marks: [] });
			} else if (format === 'md' && child.type.name === 'inline_latex') {
				// markdown shows a snippet as its characters: one whose syntax lost its meaning (a footnote whose
				// definition went) reads back as those characters, and the reader sees the same
				for (const ch of child.textContent) cells.push({ ch: /\s/.test(ch) ? ' ' : ch, marks: [] });
			} else {
				cells.push({
					ch: `‹${child.type.name}:${child.textContent.replace(/\s+/g, ' ').trim() || JSON.stringify(child.attrs)}›`,
					marks: []
				});
			}
		});
		return cells;
	}
	function render(given: Cell[]): string {
		const cells = given.map((c) => ({ ...c }));
		function word(c: string) {
			return /^[\p{L}\p{N}]$/u.test(c);
		}
		function emphasis(m: string) {
			return /^(strong|em|s)$/.test(m);
		}
		const head = cells.findIndex((c) => c.ch !== ' ' && c.ch !== '⏎' && !c.marks.includes('item_label'));
		if (head >= 0) for (let i = head; i < cells.length; i++) cells[i].marks = cells[i].marks.filter((m) => m !== 'item_label');
		if (format === 'md') {
			for (let i = 0; i < cells.length;) {
				if (!word(cells[i].ch)) {
					cells[i].marks = cells[i].marks.filter((m) => !emphasis(m));
					i++;
					continue;
				}
				let j = i;
				while (j < cells.length && word(cells[j].ch)) j++;
				function key(k: number) {
					return cells[k].marks.filter(emphasis).sort().join('+');
				}
				if (cells.slice(i, j).some((_, k) => key(i + k) !== key(i)))
					for (let k = i; k < j; k++) cells[k].marks = cells[k].marks.filter((m) => !emphasis(m));
				i = j;
			}
		}
		let out = '';
		let key = '';
		for (const { ch, marks } of cells) {
			const k = [...marks].sort().join('+');
			if (ch !== ' ' && ch !== '⏎' && k !== key) {
				out += `«${k}»`;
				key = k;
			}
			out += ch;
		}
		out = out
			.replace(/\s+/g, ' ')
			.replace(/ ?⏎ ?/g, '⏎')
			.replace(/›(«[^»]*»)? /g, '›$1')
			.replace(/ («[^»]*»)?‹/g, '$1‹')
			.trim()
			.replace(/^⏎+/, '');
		if (format === 'md') out = out.replace(/⏎+$/, '');
		return out.replace(/^«»/, '');
	}
	function push(path: string, name: string, line: string) {
		let text = line;
		if (!text) return;
		const comments = format === 'typ' && name === 'paragraph' ? /^(‹inline_latex:\/[/*][^‹›]*›⏎?)+/.exec(text) : null;
		if (comments && comments[0].length < text.length) {
			push(path, name, comments[0]);
			text = text.slice(comments[0].length);
		}
		if (name === 'paragraph' && /^(‹inline_latex:[^‹›]*›⏎?)+$/.test(text)) {
			lines.push(`${path}raw_latex: ${text.replace(/‹inline_latex:|›|⏎|\s/g, '')}`);
		} else if (name === 'raw_latex') lines.push(`${path}raw_latex: ${text.replace(/\s/g, '')}`);
		else lines.push(`${path}${name}: ${text}`);
	}
	function typstDisplay(child: PMNode, path: string): boolean {
		function equation(tex: string, label: unknown) {
			return `${path}block_math: ${tex.replace(/\s+/g, ' ').trim()}${label ? ` <${label}>` : ''}`;
		}
		if (child.type.name === 'block_math') {
			lines.push(equation(child.textContent, child.attrs.label));
			return true;
		}
		if (child.type.name !== 'paragraph') return false;
		const kids: PMNode[] = [];
		child.forEach((c) => {
			if (!c.isText || c.text!.trim()) kids.push(c);
		});
		const lead = kids.findIndex((c) => !(c.type.name === 'inline_latex' && /^\/[/*]/.test(c.textContent)));
		const [math, label, ...more] = lead < 0 ? [] : kids.slice(lead);
		if (math?.type.name !== 'inline_math' || !/^\s/.test(math.textContent) || more.length) return false;
		if (label && !(label.type.name === 'inline_latex' && /^<[^<>]*>$/.test(label.textContent))) return false;
		const comments = kids.slice(0, lead).map((c) => c.textContent);
		if (comments.length) push(path, 'raw_latex', comments.join(''));
		lines.push(equation(math.textContent, label?.textContent.slice(1, -1)));
		return true;
	}
	function walkBlocks(node: PMNode, path: string) {
		node.forEach((child, _offset, index) => {
			const name = child.type.name;
			if (format === 'typ' && typstDisplay(child, path)) return;
			if (node.type.name === 'list' && index > 0 && child.isTextblock) {
				const cells = cellsOf(child).map((c) => ({ ...c, marks: c.marks.filter((m) => m !== 'item_label') }));
				push(path, name, render(cells));
				return;
			}
			if (child.type.spec.code) {
				push(path, name, child.textContent.replace(/\s+/g, ' ').trim());
			} else if (format === 'md' && name === 'image') {
				push(
					path,
					'paragraph',
					`‹inline_latex:${formatImage(String(child.attrs.alt ?? ''), String(child.attrs.src ?? ''), render(cellsOf(child)))}›`
				);
			} else if (format === 'typ' && name === 'image' && child.attrs.showCaption === false) {
				lines.push(`${path}${name}`);
			} else if (format === 'md' && /^table_(cell|header)$/.test(name)) {
				const cells: Cell[] = [];
				child.forEach((p) => {
					const own = cellsOf(p);
					if (!own.some((c) => c.ch !== ' ' && c.ch !== '⏎')) return;
					if (cells.length) cells.push({ ch: '⏎', marks: [] });
					cells.push(...own);
				});
				push(`${path}${name}>`, 'paragraph', render(cells));
			} else if (child.isTextblock) {
				// a label is one only at the head of an item: one Shift+Tab took out of its list reads as its bold
				const cells = cellsOf(child);
				const shown = node.type.name === 'list' ? cells : cells.map((c) => ({ ...c, marks: c.marks.filter((m) => m !== 'item_label') }));
				push(path, `${name}${child.attrs.level ?? ''}`, render(shown));
			} else if (child.isLeaf || child.isAtom) {
				lines.push(`${path}${name}`);
			} else {
				walkBlocks(child, `${path}${name}>`);
			}
		});
	}
	walkBlocks(doc, '');
	const raw = /^(.*?)raw_latex: (.*)$/;
	const out: string[] = [];
	for (const line of lines) {
		const prev = out[out.length - 1];
		const a = prev && raw.exec(prev);
		const b = raw.exec(line);
		if (a && b && a[1] === b[1]) out[out.length - 1] = `${a[1]}raw_latex: ${a[2]}${b[2]}`;
		else out.push(line);
	}
	return out;
}

export function printedLine(line: string, format: VisualFormat): string {
	if (format === 'tex')
		return line.replace(/’/g, "'").replace(/‘/g, '`').replace(/“/g, '``').replace(/”/g, "''").replace(/—/g, '---').replace(/–/g, '--');
	if (format === 'typ') return line.replace(/…/g, '...').replace(/—/g, '---').replace(/–/g, '--');
	return line;
}

export function wordsOfLine(line: string): string {
	return line
		.slice(line.indexOf(': ') + 2)
		.replace(/«[^»]*»|‹[a-z_]+:|›/g, '')
		.replace(/\s+/g, '');
}

/**
 * How `again`, the document a saved file parses to, differs from `doc`, the document the file was
 * written from: null when the reader sees the same words, structure and marks. The first difference
 * is named in a line or two.
 */
/** the top-level blocks of `doc` that read otherwise in `again`, when the two have as many; none when they do not */
export function differingBlocks(doc: PMNode, again: PMNode, format: VisualFormat): number[] {
	if (doc.childCount !== again.childCount) return [];
	const out: number[] = [];
	for (let i = 0; i < doc.childCount; i++)
		if (reopenDifference(doc.copy(Fragment.from(doc.child(i))), again.copy(Fragment.from(again.child(i))), format)) out.push(i);
	return out;
}

export function reopenDifference(doc: PMNode, again: PMNode, format: VisualFormat): string | null {
	const want = visibleLines(doc, format).map((l) => printedLine(l, format));
	const got = visibleLines(again, format).map((l) => printedLine(l, format));
	const ww = want.map(wordsOfLine).join('');
	const gw = got.map(wordsOfLine).join('');
	if (ww !== gw) {
		let i = 0;
		while (i < ww.length && ww[i] === gw[i]) i++;
		return `words change on reopen: ${JSON.stringify(ww.slice(Math.max(0, i - 30), i + 30))} became ${JSON.stringify(gw.slice(Math.max(0, i - 30), i + 30))}`;
	}
	for (let i = 0; i < Math.max(want.length, got.length); i++) {
		if (want[i] === got[i]) continue;
		return `structure or marks change on reopen: ${JSON.stringify((want[i] ?? '').slice(0, 120))} became ${JSON.stringify((got[i] ?? '').slice(0, 120))}`;
	}
	return null;
}
