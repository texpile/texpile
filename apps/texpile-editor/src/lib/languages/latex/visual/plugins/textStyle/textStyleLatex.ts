import type { TextStyle } from '$lib/languages/latex/visual/core/document';

function opener(style: TextStyle, next: string): string {
	// a name the next letter would run on into
	const sep = style.sep === '' && /^[a-zA-Z@]/.test(next) ? ' ' : style.sep;
	if (style.form === 'arg') return `\\${style.command}${style.sep}{`;
	return `${style.form === 'group' ? '{' + (style.lead ?? '') : ''}\\${style.command}${sep}`;
}

export function textStyleWrap(attrs: Record<string, unknown>, inner: string): { open: string; close: string } {
	const styles = ((attrs.styles as TextStyle[]) ?? []).filter((s) => !s.skip);
	let open = '';
	let close = '';
	for (let i = styles.length - 1; i >= 0; i--) {
		open = opener(styles[i], open || inner) + open;
		if (styles[i].form !== 'bare') close += '}';
	}
	return { open, close };
}
