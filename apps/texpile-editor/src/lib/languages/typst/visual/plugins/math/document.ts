import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { displayMath, inlineMath } from './mathImport';
import { equationCallSeg } from './equationCall';
import { mathSchema } from './mathSchema';
import { endsInLineComment } from './equationClose';

export const mathDocument: TypstDocumentPlugin = {
	import: { markup: { blocks: { Equation: displayMath }, inline: { Equation: inlineMath } }, roles: { blocks: equationCallSeg } },
	schema: mathSchema,
	save: {
		nodes: {
			block_math(node, _ctx, core) {
				const inner = node.textContent.trim();
				if (!inner) return '';
				// the label rides after the closing dollar, where typst attaches it to the equation
				const label = core.label(node);
				const close = endsInLineComment(inner) ? '\n$' : ' $';
				const call = node.attrs.typEquation as { name: string; lead: string; tail: string } | null;
				if (call) return `#${call.name}(${call.lead}$ ${inner}${close}${call.tail})${label}\n\n`;
				return `$ ${inner}${close}${label}\n\n`;
			}
		},
		inline: {
			inline_math(node, run) {
				// the content keeps its padding: `$ x $` mid-paragraph is display math
				const t = node.textContent;
				const close = endsInLineComment(t) ? '\n$' : '$';
				return { content: t.trim() ? run.shadowed(node, `$${t}${close}`) : '', marks: run.marks(node.marks), kind: 'other' };
			}
		},
		wholeRun: (node) => node.type.name === 'block_math'
	}
};
