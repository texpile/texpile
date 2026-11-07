import { describe, expect, it } from 'vitest';
import { titlePageFields } from '$lib/languages/latex/visual/plugins/slides/titlePageFields';

describe('the title page', () => {
	it('reads what the preamble sets, the first of each and none from a comment or a macro', () => {
		const preamble = String.raw`\documentclass{beamer}
% \title{Not this one}
\title[Short]{A \textbf{long} talk}
\subtitle{Part one}
\author{Ada\inst{1} \and Grace}
\institute{Technische Universit\"at\\M\"unchen}
\date{\today}
\newcommand{\setup}{\title{Hidden}}
\title{Second}
\begin{document}`;
		expect(titlePageFields(preamble, 'Nov 1')).toEqual({
			title: 'A long talk',
			subtitle: 'Part one',
			author: 'Ada, Grace',
			institute: 'Technische Universität\nMünchen',
			date: 'Nov 1'
		});
		expect(titlePageFields('\\documentclass{beamer}\n\\begin{document}').title).toBe('');
	});
});
