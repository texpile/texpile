import type { Mark, Node } from 'prosemirror-model';
import type { TextStyle } from '../parser/tree/convert/textStyleRuns';
import { markableMarks } from './textEscapes';
import { standIn } from './latexShadowRun';
import { noteSpans, spansOf } from '$lib/editor/visual/sourceSpans';

function stylesOf(node: Node): TextStyle[] | null {
	const marks = markableMarks(node);
	if (!marks) return null;
	return (marks.find((m) => m.type.name === 'text_style')?.attrs.styles as TextStyle[] | undefined) ?? [];
}

function same(a: TextStyle | undefined, b: TextStyle | undefined): boolean {
	return !!a && !!b && a.command === b.command && a.form === b.form;
}

function sharesPrefix(styles: TextStyle[] | null, of: TextStyle[], k: number): boolean {
	if (!styles) return true;
	for (let j = 0; j <= k; j++) if (!same(styles[j], of[j])) return false;
	return true;
}

function withStyles(node: Node, styles: TextStyle[]): Node {
	const type = node.type.schema.marks.text_style;
	const others: readonly Mark[] = node.marks.filter((m) => m.type !== type);
	const copy = node.mark(type.create({ styles }).addToSet(others));
	return standIn(noteSpans(copy, spansOf(node)), node);
}

export function scopeTextStyles(children: readonly Node[]): readonly Node[] {
	const all = children.map(stylesOf);
	if (!all.some((s) => s?.some((style) => style.form === 'bare'))) return children;
	let inForce: TextStyle[] = [];
	return children.map((child, i) => {
		const styles = all[i];
		if (!styles) return child;
		const scoped = styles.map((style, k): TextStyle => {
			if (style.form !== 'bare') return style;
			if (all.slice(i + 1).some((later) => !sharesPrefix(later, styles, k))) return { ...style, form: 'group' };
			const held = styles.slice(0, k + 1).every((s, j) => s.form === 'bare' && same(inForce[j], s));
			return held ? { ...style, skip: true } : style;
		});
		if (child.marks.every((m) => m.type.name === 'text_style')) {
			const open = scoped.findIndex((s) => s.form !== 'bare');
			inForce = open < 0 ? scoped : scoped.slice(0, open);
		}
		return scoped.every((s, k) => s === styles[k]) ? child : withStyles(child, scoped);
	});
}
