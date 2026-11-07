import type { Node } from 'prosemirror-model';
import { alignEnvironment, blockMath } from './mathBlocks';

export function blockMathLatex(node: Node): string {
	const content = node.textContent;
	const numbered = Boolean(node.attrs.numbered ?? false);
	const label = (node.attrs.label as string) || '';
	const environment = (node.attrs.environment as string | null) ?? null;
	const lineLabels = (node.attrs.lineLabels as string[]) ?? [];
	if (environment) {
		return alignEnvironment(content, { environment, lineLabels, label: label || undefined, numbered });
	}
	return blockMath(content, { numbered, label: label || undefined, starredEnv: node.attrs.starredEnv === true });
}
