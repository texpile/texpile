import { m } from '$lib/paraglide/messages';

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);

/** Texpile reads and writes UTF-8 only; anything else opens read-only rather than being saved back mangled. */
export function sourceEncodingError(text: string): string | null {
	if (text.includes(NUL)) return m.wsview_load_error_utf16();
	if (text.includes(REPLACEMENT)) return m.wsview_load_error_not_utf8();
	return null;
}
