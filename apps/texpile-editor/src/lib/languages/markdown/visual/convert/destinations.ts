import { decodeHTMLStrict } from 'entities/decode';

const ESCAPE_OR_ENTITY = /\\([!-/:-@[-`{-~])|&([a-z#][a-z0-9]{1,31});/gi;

export function unescapeAll(text: string): string {
	if (!text.includes('\\') && !text.includes('&')) return text;
	return text.replace(ESCAPE_OR_ENTITY, (whole, escaped: string | undefined) => {
		if (escaped) return escaped;
		const decoded = decodeHTMLStrict(whole);
		return decoded;
	});
}

export function destinationText(raw: string): string {
	const inner = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
	return unescapeAll(inner);
}

export function titleText(raw: string): string {
	return unescapeAll(raw.slice(1, -1));
}

/** a link keeps its escapes; a picture's path is read, as it is looked up on disk */
export function readDestination(raw: string, kind: 'href' | 'src'): string {
	const text = destinationText(raw);
	if (kind === 'href') return text.replace(/%(?:[01][0-9a-f]|7f)/gi, (e) => String.fromCharCode(parseInt(e.slice(1), 16)));
	try {
		return decodeURI(text);
	} catch {
		return text;
	}
}
