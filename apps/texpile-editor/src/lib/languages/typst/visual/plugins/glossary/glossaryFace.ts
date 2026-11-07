// a glossary or acronym call drawn as the term it prints, read from the entries the project registers
import {
	tip,
	sourceHint,
	type ChipFace,
	withoutTrailingLabel,
	type TypstCall,
	readPackageUse,
	typstScopeOfDrawing,
	faceFollowingScope,
	showGlossaryTerm
} from '$lib/languages/typst/visual/core';
import { registeredEntry, registeredListChanged } from './glossaryEntries';
import { fillTemplate } from './glossaryText';
import { m } from '$lib/paraglide/messages';
import { argumentText, paramFor, type TypstEntry, type TypstFileScope, type TypstGlossaryUse } from '$lib/languages/typst/knowledge';

type GlossaryCall = { key: string; forms: TypstGlossaryUse; display: string | null; flag: string | null };

const SWITCH = /^(none|true|false)$/;

/** null when an argument changes what the call prints in a way the data does not say */
function readGlossaryCall(entry: TypstEntry, call: TypstCall): GlossaryCall | null {
	const [first] = call.args.filter((arg) => arg.name === null);
	if (!entry.glossary || first?.kind !== 'Str' || call.bodies.length) return null;
	const key = argumentText(first.node, call.source);
	if (key === null) return null;
	const out: GlossaryCall = { key, forms: entry.glossary, display: null, flag: null };
	for (const arg of call.args.filter((a) => a.name !== null)) {
		const param = paramFor(entry, { name: arg.name! });
		const value = arg.value.trim();
		if (!param) return null;
		if (param.role === 'text') out.display = argumentText(arg.node, call.source);
		else if (SWITCH.test(param.default ?? '') && (value === 'true' || value === 'false')) {
			if (value === 'true' && Object.hasOwn(entry.glossary.flags ?? {}, param.name)) out.flag = param.name;
		} else if (value !== param.default) return null;
		if (param.role === 'text' && out.display === null) return null;
	}
	return out;
}

function drawGlossary(written: string, used: GlossaryCall, scope: TypstFileScope | null): ChipFace {
	const dom = document.createElement('span');
	const entry = scope ? registeredEntry(scope, used.key) : undefined;
	const later = entry ? fillTemplate(used.flag ? used.forms.flags![used.flag] : used.forms.next, entry) : null;
	// no entry among the ones the project registers
	const missing = used.display === null && entry === null;
	showGlossaryTerm(dom, used.display ?? later ?? used.key, missing);
	// the first use prints the long form, which the later uses leave out
	const first = entry ? fillTemplate(used.forms.first, entry) : null;
	const tipped = tip(
		dom,
		missing ? m.glossary_entry_not_found({ key: used.key }) : first && first !== dom.textContent ? first : sourceHint(written)
	);
	return { dom, destroy: () => tipped.destroy() };
}

export function glossaryFace(source: string): ChipFace | null {
	const written = source.trim();
	const scope = typstScopeOfDrawing(written);
	const use = readPackageUse(withoutTrailingLabel(written), scope);
	const used = use?.call ? readGlossaryCall(use.found.entry, use.call) : null;
	if (!used) return null;
	function draw(): ChipFace {
		return drawGlossary(written, used!, typstScopeOfDrawing(written));
	}
	return faceFollowingScope(draw(), draw, (changed) => {
		const now = typstScopeOfDrawing(written);
		return !now || registeredListChanged(now, changed);
	});
}
