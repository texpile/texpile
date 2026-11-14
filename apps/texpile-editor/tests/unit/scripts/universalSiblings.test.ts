import { it, expect } from 'vitest';
import { withoutUniversalSiblings } from '../../../scripts/universalSiblings';

it('rewrites a universal sibling subject and leaves named ones', () => {
	expect(withoutUniversalSiblings('.label > * + *')).toBe('.label > :where(:not(:first-child))');
	expect(withoutUniversalSiblings('.select optgroup>*+*,.select optgroup option:first-of-type')).toBe(
		'.select optgroup> :where(:not(:first-child)),.select optgroup option:first-of-type'
	);
	expect(withoutUniversalSiblings('.a > * + p, h1 + h2, .b > * + * .c')).toBe('.a > * + p, h1 + h2, .b > * + * .c');
});
