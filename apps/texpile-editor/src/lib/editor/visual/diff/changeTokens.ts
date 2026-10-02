// How two documents are compared token by token.
//
// changeset's default encoder sees only text and node type, so a section demoted to a subsection,
// a figure repointed at another file, or a phrase emphasised are all invisible - and a diff that
// reports "no changes" for a real edit is worse than no diff. Characters stay numbers: this runs
// over the whole document, so only the cases needing more than a code point pay for a string.
import type { Mark } from 'prosemirror-model';
import type { TokenEncoder } from 'prosemirror-changeset';

type Token = string | number;

// Plumbing a block carries from the file, not what it is: a float's raw prefix is re-emitted
// as it was, never read. Nothing real hides behind it - if the content differs, its own tokens
// differ.
const PROVENANCE = new Set(['preBody', 'envKey']);

function contentAttrs(attrs: Record<string, unknown>): string | null {
	const keys = Object.keys(attrs).filter((k) => !PROVENANCE.has(k));
	if (!keys.length) return null;
	keys.sort();
	return keys.map((k) => `${k}=${JSON.stringify(attrs[k])}`).join(',');
}

/** stable regardless of the order marks happen to be stored in */
function markKey(marks: readonly Mark[]): string {
	return marks
		.map((mark) => {
			const attrs = contentAttrs(mark.attrs);
			return attrs ? `${mark.type.name}(${attrs})` : mark.type.name;
		})
		.sort()
		.join('+');
}

export const changeTokens: TokenEncoder<Token> = {
	encodeCharacter: (char, marks) => (marks.length ? `${char}${markKey(marks)}` : char),
	// for an image or a heading the attributes ARE the content
	encodeNodeStart: (node) => {
		const attrs = contentAttrs(node.attrs);
		return attrs ? `<${node.type.name} ${attrs}` : `<${node.type.name}`;
	},
	encodeNodeEnd: (node) => `>${node.type.name}`,
	compareTokens: (a, b) => a === b
};
