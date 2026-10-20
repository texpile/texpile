import { unified, type Plugin } from 'unified';
import {
	unifiedLatexFromString,
	unifiedLatexAstComplier,
	unifiedLatexProcessAtLetterAndExplMacros
} from '@unified-latex/unified-latex-util-parse';
import { unifiedLatexTrimEnvironmentContents, unifiedLatexTrimRoot } from '@unified-latex/unified-latex-util-trim';
import type { Root, Node, Argument, MacroInfoRecord, EnvInfoRecord } from '@unified-latex/unified-latex-types';
import type { ParseOptions, LatexAst } from './types';
import { parseMinimal } from './pegMinimal';
import { processMacrosAndEnvironments } from './macrosAndEnvironments';
import { environmentTable, macroTable, mathTable } from './signatures/signatureTable';
import { tokenizerNames, type TokenizerNames } from './signatures/tokenizerNames';
import { joinCommentRuns } from './commentRuns';

// @unified-latex plugins are built against unified@10, this app uses @11: the Plugin<> generics
// don't structurally match though the runtime contract is the same. cast via `unknown` first so
// it stays a type erasure of a known shape, not an open hole.
type UnifiedLatexPluginOptions = Pick<ParseOptions, 'mode' | 'flags'> & { macros: MacroInfoRecord; environments: EnvInfoRecord };
type UnifiedLatexFromStringPlugin = Plugin<[UnifiedLatexPluginOptions], string, Root>;
type UnifiedLatexParserPlugin = Plugin<[TokenizerNames], string, Root>;
type UnifiedLatexTransformPlugin<O = void> = Plugin<[O], Root, Root>;
type UnifiedLatexAstComplierPlugin = Plugin<[], Root, Root>;

function memoFreeMinimalParser(this: { Parser?: (str: string) => Root }, names: TokenizerNames) {
	// unified passes the file as a second argument; the tokenizer takes the string alone
	Object.assign(this, { Parser: (str: string) => parseMinimal(str, names) });
}

// unifiedLatexFromString with its tokenizer stage swapped for the vendored one (see pegMinimal)
// and its macro-and-environment stage for the one keeping the file's offsets through the math
// re-parse (see macrosAndEnvironments): whole-string, since its memo grows only with the file's
// groups and environments. math mode keeps upstream's: its inputs are small, its root is
// shaped differently, and its offsets count from the string it is handed either way
function processorFor(options: ParseOptions) {
	if (options.mode === 'math') {
		return unified()
			.use(unifiedLatexFromString as unknown as UnifiedLatexFromStringPlugin, {
				mode: options.mode,
				macros: { ...macroTable(options), ...mathTable(options) },
				environments: environmentTable(options),
				flags: options.flags
			})
			.use(unifiedLatexAstComplier as unknown as UnifiedLatexAstComplierPlugin);
	}
	const { flags = {} } = options;
	return unified()
		.use(memoFreeMinimalParser as unknown as UnifiedLatexParserPlugin, tokenizerNames(options.table))
		.use(unifiedLatexProcessAtLetterAndExplMacros as unknown as UnifiedLatexTransformPlugin<ParseOptions['flags']>, flags)
		.use(processMacrosAndEnvironments, {
			macros: macroTable(options),
			environments: environmentTable(options),
			mathCommands: mathTable(options)
		})
		.use(unifiedLatexTrimEnvironmentContents as unknown as UnifiedLatexTransformPlugin)
		.use(unifiedLatexTrimRoot as unknown as UnifiedLatexTransformPlugin)
		.use(unifiedLatexAstComplier as unknown as UnifiedLatexAstComplierPlugin);
}

function parseWith(processor: ReturnType<typeof processorFor>, source: string): LatexAst {
	const ast = processor.processSync({ value: source }).result as Root;
	joinCommentRuns(ast);
	return ast;
}

export function parseLatex(source: string, options: ParseOptions = {}): LatexAst {
	return parseWith(processorFor(options), source);
}

/** parse math-mode content (no $ delimiters). */
export function parseLatexMath(source: string, options: Omit<ParseOptions, 'mode'> = {}): LatexAst {
	return parseLatex(source, { ...options, mode: 'math' });
}

/** reusable parser with fixed options; cheaper than parseLatex per call. */
export function createLatexParser(options: ParseOptions = {}): (source: string) => LatexAst {
	const processor = processorFor(options).freeze();
	return (source: string): LatexAst => parseWith(processor, source);
}

export function debugPrintAst(ast: Root | Node | Argument | (Node | Argument)[], indent: number = 0): string {
	const pad = '  '.repeat(indent);

	if (Array.isArray(ast)) {
		return ast.map((node) => debugPrintAst(node, indent)).join('\n');
	}

	const node = ast;
	let result = `${pad}${node.type}`;

	switch (node.type) {
		case 'string':
			result += `: "${node.content}"`;
			break;
		case 'macro':
			result += `: \\${node.content}`;
			if (node.args && node.args.length > 0) {
				result += '\n' + node.args.map((arg) => debugPrintAst(arg, indent + 1)).join('\n');
			}
			break;
		case 'environment':
			result += `: ${node.env}`;
			if ('content' in node && Array.isArray(node.content)) {
				result += '\n' + debugPrintAst(node.content, indent + 1);
			}
			break;
		case 'inlinemath':
		case 'displaymath':
		case 'group':
		case 'root':
			if ('content' in node && Array.isArray(node.content)) {
				result += '\n' + debugPrintAst(node.content, indent + 1);
			}
			break;
		case 'argument':
			result += ` [${node.openMark}...${node.closeMark}]`;
			if ('content' in node && Array.isArray(node.content)) {
				result += '\n' + debugPrintAst(node.content, indent + 1);
			}
			break;
		case 'comment':
			result += `: % ${node.content}`;
			break;
		case 'whitespace':
		case 'parbreak':
			break;
	}

	return result;
}
