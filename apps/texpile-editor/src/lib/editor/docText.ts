// one full-string materialization per document version: CM's Text.toString() rebuilds the whole
// string on every call, and half a dozen extensions ask for it per keystroke. Text is immutable,
// so a WeakMap keyed on the Text object makes repeat calls free AND gives text-keyed caches a
// reference-equal fast path (string equality short-circuits on identity).
import type { Text } from '@codemirror/state';

const cache = new WeakMap<Text, string>();

export function docText(doc: Text): string {
	let s = cache.get(doc);
	if (s === undefined) {
		s = doc.toString();
		cache.set(doc, s);
	}
	return s;
}
