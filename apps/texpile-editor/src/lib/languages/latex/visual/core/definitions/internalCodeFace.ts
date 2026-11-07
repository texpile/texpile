// a \makeatletter block the editor cannot read statement by statement, folded to one quiet line
import { faceElement, sourceHint, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { settingRow } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
import { m } from '$lib/paraglide/messages';
import { oneLine } from './texSource';

export function internalCodeFace(code: string, source: string): ChipFace {
	const lines = code.split('\n').map(oneLine).filter(Boolean);
	const dom = settingRow({ target: 'makeatletter', values: [] });
	dom.append(' - ', faceElement('span', 'drawn-setting-code', lines[0] ?? ''));
	const count = lines.length - 1;
	if (count > 0)
		dom.append(
			faceElement(
				'span',
				'drawn-setting-more',
				count === 1 ? m.drawn_chip_latex_more_lines_one() : m.drawn_chip_latex_more_lines_other({ count })
			)
		);
	return tippedFace(dom, sourceHint(source), { line: true });
}
