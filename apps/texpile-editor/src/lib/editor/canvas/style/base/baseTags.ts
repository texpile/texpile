// the user agent and Tailwind preflight defaults of the tags views and toDOM produce
import type { StyleLook } from '../../contracts/styleTypes';

const BLOCK: StyleLook = { display: 'block' };
const MONO: StyleLook = { fontFamily: 'var(--font-mono)', fontSize: '1em' };

const TAGS: Readonly<Record<string, StyleLook>> = {
	div: BLOCK,
	section: BLOCK,
	article: BLOCK,
	figure: BLOCK,
	figcaption: BLOCK,
	p: BLOCK,
	h1: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	h2: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	h3: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	h4: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	h5: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	h6: { display: 'block', fontSize: 'inherit', fontWeight: 'inherit' },
	ul: { display: 'block', listStyle: 'none' },
	ol: { display: 'block', listStyle: 'none' },
	li: { display: 'list-item' },
	blockquote: BLOCK,
	pre: { display: 'block', whiteSpace: 'pre', ...MONO },
	code: {
		...MONO,
		fontSize: '0.95em',
		padding: 'calc(var(--spacing) * 0.5) calc(var(--spacing) * 1)',
		borderRadius: 'var(--radius-base)',
		backgroundColor: 'var(--color-surface-200-800)'
	},
	kbd: MONO,
	samp: MONO,
	hr: { display: 'block', height: '0px', overflow: 'hidden', color: 'inherit', borderTopWidth: '1px' },
	strong: { fontWeight: 'bolder' },
	b: { fontWeight: 'bolder' },
	em: { fontStyle: 'italic' },
	i: { fontStyle: 'italic' },
	u: { textDecoration: 'underline' },
	s: { textDecoration: 'line-through' },
	del: { textDecoration: 'line-through' },
	small: { fontSize: '80%' },
	sup: { fontSize: '75%', lineHeight: '0', position: 'relative', verticalAlign: 'baseline', top: '-0.5em' },
	sub: { fontSize: '75%', lineHeight: '0', position: 'relative', verticalAlign: 'baseline', bottom: '-0.25em' },
	mark: { backgroundColor: '#ffff00', color: '#000000' },
	a: { color: 'inherit', textDecoration: 'inherit' },
	table: { display: 'table', borderCollapse: 'collapse', borderSpacing: '2px', textIndent: '0px' },
	colgroup: { display: 'table-column-group' },
	col: { display: 'table-column' },
	thead: { display: 'table-header-group', verticalAlign: 'middle' },
	tbody: { display: 'table-row-group', verticalAlign: 'middle' },
	tfoot: { display: 'table-footer-group', verticalAlign: 'middle' },
	tr: { display: 'table-row', verticalAlign: 'inherit' },
	td: { display: 'table-cell', verticalAlign: 'inherit' },
	th: { display: 'table-cell', verticalAlign: 'inherit', textAlign: 'center' },
	img: { display: 'block', verticalAlign: 'middle', maxWidth: '100%', height: 'auto' },
	svg: { display: 'block', verticalAlign: 'middle' }
};

const TAG_LOOKS = new Map<string, StyleLook>();

/** every element is border-box (preflight); the tag adds its own */
export function tagLook(tag: string): StyleLook {
	let look = TAG_LOOKS.get(tag);
	if (!look) TAG_LOOKS.set(tag, (look = { boxSizing: 'border-box', ...TAGS[tag] }));
	return look;
}
