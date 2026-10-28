import { m } from '$lib/paraglide/messages';
import { decodeIfText } from '$lib/collab/sharedFiles';

export const MAX_TEXT_BYTES = 4 * 1024 * 1024;

/** the file's text, or null when it is not UTF-8 or past the limit */
export function decodeEditableText(bytes: Uint8Array): string | null {
	return bytes.byteLength > MAX_TEXT_BYTES ? null : decodeIfText(bytes);
}

/** past the one limit for an editable, indexed text file */
export function exceedsTextLimit(text: string): boolean {
	if (text.length > MAX_TEXT_BYTES) return true;
	if (text.length * 3 <= MAX_TEXT_BYTES) return false;
	return new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES;
}

function megabytes(bytes: number): string {
	return (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** why a file opens read-only for its size, or null */
export function textLimitError(text: string): string | null {
	if (!exceedsTextLimit(text)) return null;
	return m.wsview_read_only_too_large({ size: megabytes(new TextEncoder().encode(text).byteLength), limit: megabytes(MAX_TEXT_BYTES) });
}
