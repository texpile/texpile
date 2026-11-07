// a set rule drawn as one quiet line saying what it sets, its Typst in the hint
import { tippedFace, type ChipFace, settingRow, type SetRule, setRuleSummary } from '$lib/languages/typst/visual/core';

export function setRuleFace(rule: SetRule, source: string): ChipFace {
	const [target, ...values] = setRuleSummary(rule);
	return tippedFace(settingRow({ target, values }), source, { line: true });
}
