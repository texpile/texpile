import type { Node } from 'prosemirror-model';
import {
	bytesSpan,
	listingLanguage,
	sliceOf,
	type PmNode,
	type TreeEnvironment,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

export function codeBlockOf(im: TreeImport, env: TreeEnvironment): PmNode {
	const body = env.node.getChild('VerbatimBody');
	const bodyFrom = body?.from ?? env.beginTo;
	const args = sliceOf(im, { from: env.beginTo, to: bodyFrom }).trim();
	const raw = body ? sliceOf(im, body) : '';
	// the newlines at either end belong to the \begin and \end lines; the serializer writes them back
	const lead = raw.length - raw.replace(/^\r?\n/, '').length;
	const text = raw.slice(lead).replace(/\r?\n[ \t]*$/, '');
	return im.core.node('code_block', { lang: listingLanguage(env.name, args) ?? 'text', env: env.name, args }, [
		im.core.text(text, null, bytesSpan(text.length, bodyFrom + lead))
	]);
}

export function codeBlockLatex(node: Node): string {
	const env = String(node.attrs.env ?? 'verbatim');
	const args = String(node.attrs.args ?? '');
	return `\\begin{${env}}${args}\n${node.textContent}\n\\end{${env}}\n\n`;
}
