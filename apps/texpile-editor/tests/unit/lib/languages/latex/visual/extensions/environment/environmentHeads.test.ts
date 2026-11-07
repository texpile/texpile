import { describe, expect, it } from 'vitest';
import { definedHeads, environmentHeadsFor, printedName } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';
import { environmentLook } from '$lib/languages/latex/visual/extensions/environment/environmentLook';

describe('environment heads', () => {
	it('reads each theorem title in the style set before it', () => {
		const heads = definedHeads(
			'\\newtheorem{theorem}{Theorem}\n\\newtheorem{lemma}[theorem]{Lemma}\n\\theoremstyle{definition}\n\\newtheorem*{definition}{Definition}\n% \\newtheorem{gone}{Gone}'
		);
		expect(heads).toEqual({
			theorem: { text: 'Theorem', style: 'plain', numbered: true },
			lemma: { text: 'Lemma', style: 'plain', numbered: true },
			definition: { text: 'Definition', style: 'definition', numbered: false }
		});
	});

	it('prints the name the packages give', () => {
		expect(printedName('proof', undefined)).toBe('Proof');
		expect(printedName('minipage', undefined)).toBeNull();
	});

	it('reads a title written as a command as the word the preamble gives it', () => {
		const heads = definedHeads(
			'\\theoremstyle{remark}\n\\newtheorem{rem}{\\protect\\remarkname}[section]\n\\providecommand{\\remarkname}{Remark}'
		);
		expect(heads.rem).toEqual({ text: 'Remark', style: 'remark', numbered: true });
	});

	it('draws an environment of the document that opens a proof as that proof', () => {
		const heads = environmentHeadsFor('\\newenvironment{svmultproof}{\\begin{proof}}{\\qed\\end{proof}}', ['svmultproof'], undefined);
		expect(environmentLook('svmultproof', '', heads)).toEqual({ kind: 'proof', head: 'Proof' });
	});
});
