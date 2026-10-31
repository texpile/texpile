import type { CodeFold } from '$lib/draw/editor/figure/figureLanguage';
import { bracketFolds } from '$lib/draw/editor/figure/codeFolds';
import { closingBracket } from '../source/syntax';

/** what the editor defines for itself, after the comment that says so, to the end of its last definition */
function texpileFolds(source: string): CodeFold[] {
	const said = /^\/\/ texpile:[^\n]*$/m.exec(source);
	const defined = said && source.indexOf('#let texpile-dimension(', said.index);
	const body = defined && defined > 0 ? source.indexOf('get-ctx(', defined) : -1;
	const end = body > 0 ? closingBracket(source, body + 'get-ctx'.length) : -1;
	return said && end > 0 ? [{ from: said.index + said[0].length, to: end + 1, label: 'texpile-dimension', collapsed: true }] : [];
}

/** what the code pane can collapse */
export function typstFolds(source: string): CodeFold[] {
	return [...texpileFolds(source), ...bracketFolds(source, '//')];
}
