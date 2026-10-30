// how a counter prints: `{section}-[Alph]` is the section's number, a dash, then its own value as a capital letter
import { printedValue, trailingValue, type NumberStyle } from './printedNumber';

export type FormPart = { ref: string } | { own: NumberStyle } | { text: string };
export type NumberForm = readonly FormPart[];

const STYLES = new Set<string>(['arabic', 'Alph', 'alph', 'Roman', 'roman', 'fnsymbol']);

export function parseForm(form: string | undefined): NumberForm | null {
	if (!form) return null;
	const parts: FormPart[] = [];
	for (const m of form.matchAll(/\{([^{}]+)\}|\[([^[\]]+)\]|([^{}[\]]+)/g)) {
		if (m[1]) parts.push({ ref: m[1] });
		else if (m[2] && STYLES.has(m[2])) parts.push({ own: m[2] as NumberStyle });
		else if (m[3]) parts.push({ text: m[3] });
		else return null;
	}
	return parts.some((p) => 'own' in p) ? parts : null;
}

/** null when a counter it prints after has no number now */
export function renderForm(form: NumberForm, value: number, printedOf: (counter: string) => string | null): string | null {
	let out = '';
	for (const part of form) {
		if ('own' in part) out += printedValue(value, part.own);
		else if ('text' in part) out += part.text;
		else {
			const printed = printedOf(part.ref);
			if (printed === null) return null;
			out += printed;
		}
	}
	return out;
}

export function ownStyleOf(form: NumberForm | null): NumberStyle | undefined {
	const own = form?.find((p) => 'own' in p);
	return own && 'own' in own ? own.own : undefined;
}

/** a form with its own value printed in another style: \appendix's letters */
export function withOwnStyle(form: NumberForm, style: NumberStyle): NumberForm {
	return form.map((p) => ('own' in p ? { own: style } : p));
}

/** what the .aux prints, as a reader sees it: `\protect \mbox {I-A}` is I-A */
export function plainPrinted(text: string): string {
	return (
		text
			.replace(/\\[a-zA-Z@]+\*?\s*/g, '')
			.replace(/[{}]/g, '')
			.replace(/~/g, ' ')
			.trim()
			// some classes write the Contents number as `1.1.` or `Table 6.1.`
			.replace(/^[A-Za-z]{2,}\s+/, '')
			.replace(/\.$/, '')
	);
}

/** an anchor's printed number read against the numbers around it now: its own value, and the form it shows */
export function readAnchor(
	printed: string,
	refs: Readonly<Record<string, string>>,
	prefer?: NumberStyle
): { value: number; form: NumberForm } | null {
	const own = trailingValue(printed, prefer);
	if (!own) return null;
	const head = printed.slice(0, printed.length - own.length);
	const parent = Object.keys(refs)
		.filter((name) => refs[name] && head.startsWith(refs[name]))
		.sort((a, b) => refs[b].length - refs[a].length)[0];
	const rest = parent ? head.slice(refs[parent].length) : head;
	const form: FormPart[] = [...(parent ? [{ ref: parent }] : []), ...(rest ? [{ text: rest }] : []), { own: own.style }];
	return { value: own.value, form };
}
