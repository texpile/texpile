import { sourceHint, tippedFace, type ChipFace } from '../chipFace';
import { appendTo, type PartElement } from '../faces/partElements';
import { chipElement } from '../looks/chipLooks';

export type DefinitionLine = { name: string; params: string; sign: string; body: PartElement };

/** `made`: a command the paper names without a body, as code */
export function definitionBody(drawn: ChipFace | null, code: string, kept: ChipFace[], made = false): PartElement {
	if (drawn && !drawn.line && !drawn.mixed) {
		kept.push(drawn);
		return appendTo(chipElement('span', 'drawn-definition-body'), drawn.dom);
	}
	drawn?.destroy?.();
	return chipElement('span', `drawn-definition-body drawn-definition-code${made ? ' drawn-definition-made' : ''}`, code);
}

export function definitionsFace(lines: DefinitionLine[], source: string, drawn: ChipFace[]): ChipFace {
	const dom = chipElement('span', 'drawn-definitions');
	for (const line of lines) {
		const name = chipElement('span', 'drawn-definition-name', line.name);
		if (line.params) appendTo(name, chipElement('span', 'drawn-definition-params', line.params));
		appendTo(dom, name, chipElement('span', 'drawn-definition-sign', line.sign), line.body);
	}
	const face = tippedFace(dom, sourceHint(source), { line: true });
	return {
		...face,
		destroy() {
			drawn.forEach((part) => part.destroy?.());
			face.destroy?.();
		}
	};
}
