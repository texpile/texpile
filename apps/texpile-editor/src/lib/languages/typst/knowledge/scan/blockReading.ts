// whether an expression yields block-level content, read from what it calls: Typst's own elements as the data says,
// the package's own functions through their bodies
import type { SyntaxNode } from '@lezer/common';
import type { TypstEntry } from '../types';
import { markupPartsOf, partsOf, textOf } from './syntax';
import { calleePath, entryAt, type NameResolver } from './scanNames';
import { stdEntry } from '../stdLibrary';
import type { TypstFileScope } from '../fileScope';

/** `content`: as block-level as the content it is given; `none`: adds nothing of its own (a parameter, `none`) */
export type BlockReading = 'block' | 'inline' | 'content' | 'none' | null;

const IGNORED = new Set(['LetBinding', 'SetRule', 'ShowRule', 'ModuleImport', 'ModuleInclude', 'LoopBreak', 'LoopContinue']);
export const BLOCK_MARKUP = new Set(['Heading', 'ListItem', 'EnumItem', 'TermItem', 'Parbreak']);
const INLINE_VALUES = new Set(['Str', 'Int', 'Float', 'Numeric', 'Bool', 'Label']);

export function joinedReading(readings: BlockReading[]): BlockReading {
	if (readings.includes('block')) return 'block';
	if (readings.includes(null)) return null;
	if (readings.includes('inline')) return 'inline';
	return readings.includes('content') ? 'content' : 'none';
}

export type BlockReader = {
	read(node: SyntaxNode): BlockReading;
};

/** `bodyOf` reads a let of the package: the expression a function returns or a value is */
export function blockReader(
	source: string,
	resolve: NameResolver,
	bodyOf: (name: string) => { reading: () => BlockReading } | null
): BlockReader {
	function ofEntry(entry: TypstEntry, args: SyntaxNode | null): BlockReading {
		if (entry.blockParam && args) {
			const named = partsOf(args).find((a) => a.name === 'Named' && textOf(a.firstChild!, source) === entry.blockParam);
			return named && /true$/.test(textOf(named, source)) ? 'block' : 'inline';
		}
		if (entry.block === true) return 'block';
		if (entry.block === false) return 'inline';
		if (entry.kind === 'type' || (entry.returns && !entry.returns.includes('content'))) return 'inline';
		return entry.block === undefined ? null : 'content';
	}
	function passed(args: SyntaxNode | null): BlockReading {
		if (!args) return 'none';
		const given = partsOf(args).filter(
			(a) => a.name !== 'Named' && a.name !== 'LeftParen' && a.name !== 'RightParen' && a.name !== 'Comma'
		);
		return joinedReading(given.map((a) => (a.name === 'Spread' ? null : read(a))));
	}
	function ofCall(node: SyntaxNode): BlockReading {
		const [callee, args = null] = partsOf(node);
		const path = callee && calleePath(callee, source);
		if (!path) return null;
		if (path.length > 1 && path[path.length - 1] === 'with') return 'none';
		const found = resolve(path[0]);
		if (!found) return null;
		let reading: BlockReading;
		if (found.kind === 'std') {
			const entry = path.length === 1 ? found.entry : entryAt(found.entry, path.slice(1));
			if (!entry) return null;
			reading = ofEntry(entry, args);
		} else if (found.kind === 'own' && path.length === 1) reading = bodyOf(path[0])?.reading() ?? null;
		else return null;
		if (reading !== 'content') return reading;
		const given = passed(args);
		return given === 'none' ? 'content' : given === 'content' ? 'content' : given;
	}
	function ofMarkup(node: SyntaxNode): BlockReading {
		const readings: BlockReading[] = [];
		for (const part of markupPartsOf(node)) {
			if (BLOCK_MARKUP.has(part.name)) readings.push('block');
			else if (part.name === 'Raw') readings.push(/^```[^\n]*\n/.test(textOf(part, source)) ? 'block' : 'inline');
			else if (part.name === 'Equation') readings.push(/^\$\s[\s\S]*\s\$$/.test(textOf(part, source)) ? 'block' : 'inline');
			else if (part.name === 'Strong' || part.name === 'Emph' || part.name === 'Text' || part.name === 'Space') readings.push('inline');
			else if (part.name === 'Markup') readings.push(ofMarkup(part));
			else readings.push(isExpression(part) ? read(part) : 'inline');
		}
		return joinedReading(readings);
	}
	function read(node: SyntaxNode): BlockReading {
		switch (node.name) {
			case 'FuncCall':
				return ofCall(node);
			case 'ContentBlock':
				return node.getChild('Markup') ? ofMarkup(node.getChild('Markup')!) : 'none';
			case 'Markup':
				return ofMarkup(node);
			case 'CodeBlock':
				return node.getChild('Code') ? read(node.getChild('Code')!) : 'none';
			case 'Code':
				return joinedReading(
					partsOf(node)
						.filter((s) => !IGNORED.has(s.name))
						.map(read)
				);
			case 'Contextual':
			case 'Parenthesized':
			case 'FuncReturn':
				return partsOf(node).length > 1 ? read(partsOf(node)[partsOf(node).length - 1]) : 'none';
			case 'Conditional': {
				const parts = partsOf(node).filter((p) => p.name !== 'If' && p.name !== 'Else');
				return joinedReading(parts.slice(1).map(read));
			}
			case 'ForLoop':
			case 'WhileLoop':
				return read(partsOf(node)[partsOf(node).length - 1]);
			case 'Binary': {
				const parts = partsOf(node);
				return parts.length === 3 && textOf(parts[1], source) === '+' ? joinedReading([read(parts[0]), read(parts[2])]) : 'inline';
			}
			case 'Ident': {
				const found = resolve(textOf(node, source));
				if (found?.kind === 'param') return 'none';
				if (found?.kind === 'own') return bodyOf(textOf(node, source))?.reading() ?? null;
				return null;
			}
			case 'None':
			case 'Auto':
				return 'none';
			default:
				return INLINE_VALUES.has(node.name) ? 'inline' : null;
		}
	}
	return { read };
}

function isExpression(node: SyntaxNode): boolean {
	return !['Shorthand', 'Escape', 'SmartQuote', 'Linebreak', 'Link', 'Ref', 'Label', 'Raw', 'Equation'].includes(node.name);
}

/** whether content a file gives (a content block, an equation, a call) holds a block, its names read through the file's scope */
export function holdsBlock(node: SyntaxNode, source: string, scope: TypstFileScope | null): boolean {
	const reader = blockReader(
		source,
		(name) => {
			const entry = scope ? scope.lookup(name)?.entry : stdEntry(name);
			return entry ? { kind: 'std', entry } : null;
		},
		() => null
	);
	return reader.read(node) === 'block';
}
