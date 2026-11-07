// link and image targets as the author wrote them
import { decodeHTMLStrict } from 'entities/decode';

const ESCAPE_OR_ENTITY = /\\([!-/:-@[-`{-~])|&([a-z#][a-z0-9]{1,31});/gi;

/** backslash escapes and character references replaced by what they stand for */
export function unescapeAll(text: string): string {
	if (!text.includes('\\') && !text.includes('&')) return text;
	return text.replace(ESCAPE_OR_ENTITY, (whole, escaped: string | undefined) => {
		if (escaped) return escaped;
		const decoded = decodeHTMLStrict(whole);
		return decoded;
	});
}

/** the destination of a link or image: `<...>` unwrapped, escapes read */
export function destinationText(raw: string): string {
	const inner = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
	return unescapeAll(inner);
}

/** the title between its quotes or parentheses */
export function titleText(raw: string): string {
	return unescapeAll(raw.slice(1, -1));
}

/**
 * A link is a URL and keeps its escapes (`100%25` stays), except the control characters the
 * serializer writes as escapes. A picture's path is looked up on disk, so its escapes are read:
 * `my%20file.png` is the file with the space. decodeURI leaves `?#&=+` alone, so a query string
 * or a `#gh-dark-mode-only` fragment survives. A path with a literal `%` (`100%.png`) is not valid
 * escaping and stays as written.
 */
export function readDestination(raw: string, kind: 'href' | 'src'): string {
	const text = destinationText(raw);
	if (kind === 'href') return text.replace(/%(?:[01][0-9a-f]|7f)/gi, (e) => String.fromCharCode(parseInt(e.slice(1), 16)));
	try {
		return decodeURI(text);
	} catch {
		return text;
	}
}
