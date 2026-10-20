// which AST nodes start a block of their own, and which environments stay chips
import type { Node, Macro } from '@unified-latex/unified-latex-types';
import { type RawStamped } from '../ast-utils';
import { commonFacts } from '../../knowledge/commands/commandFacts';
import type { EnvFacts } from '../../knowledge/environments/envFacts';

/** inParagraph: prose is already buffered, so the arity guess below must not split it */
export function isBlockNode(node: Node, inParagraph = false): boolean {
	if (node.type === 'environment') return true;
	if (node.type === 'verbatim') return true;
	if (node.type === 'mathenv') return true;
	if (node.type === 'displaymath') return true;
	if (node.type === 'macro') {
		const macro = node as Macro;

		// a verbatim-captured commented call is ALWAYS a block: it ends in a trailing % comment,
		// so inline emission would let the paragraph's ` \par` land on the comment line
		// (commented out) and compound every save.
		if ((macro as RawStamped<Macro>)._raw != null) return true;

		if (macro.content === 'maketitle' || macro.content === 'title' || macro.content === 'author' || macro.content === 'date') return true;

		const blockMacros = new Set([
			'hrule',
			'rule',
			'bibliography',
			'printbibliography',
			'tableofcontents',
			'listoffigures',
			'listoftables',
			'maketitle',
			'newpage',
			'clearpage',
			'pagebreak',
			// cross-document includes: a standalone includedoc chip (block, not paragraph-wrapped)
			'input',
			'include',
			'subfile',
			// image is a BLOCK, so \includegraphics must never buffer into a paragraph's inline
			// content (a mid-paragraph one splits the paragraph, order preserved). in inline-only
			// contexts the non-inline-result guard demotes it to a verbatim chip instead.
			'includegraphics',
			// command-form \abstract builds a block node; through the inline path it buffered a
			// block inside a paragraph (frozen editor on the first structural edit).
			'abstract'
		]);
		if (blockMacros.has(macro.content) || commonFacts(macro.content).section != null) return true;

		// heuristic: 3+ mandatory args is likely a preamble/config command, treat as a raw block.
		// only at a block boundary: mid-sentence (\iftoggle{a}{b}{c}, \resizebox, \SIrange) it is
		// an inline chip, or the paragraph splits in three with a \par between
		if (macro.args && !inParagraph) {
			const mandatoryArgs = macro.args.filter((arg) => arg.openMark === '{' && arg.closeMark === '}');
			if (mandatoryArgs.length >= 3) return true;
		}
		return false;
	}
	return false;
}

/** an environment with no widget whose body is not prose stays a chip */
export function staysRawEnvironment(facts: EnvFacts): boolean {
	return facts.body != null || facts.in === 'math' || facts.cells === true || facts.item != null;
}
