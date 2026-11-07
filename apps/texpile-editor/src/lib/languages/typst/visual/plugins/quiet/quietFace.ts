// a call that prints nothing drawn as a quiet line saying what it does, and a citation that is not printed as the note that
// it is in the bibliography
import { settingsFace, sourceHint, type ChipFace, faceOf } from '$lib/languages/typst/visual/core';
import { readQuiet } from './quietCall';
import { m } from '$lib/paraglide/messages';

export function quietFace(source: string): ChipFace | null {
	const quiet = readQuiet(source);
	if (!quiet) return null;
	const written = source.trim();
	if (quiet.kind === 'cite') return faceOf(m.nocite_listed({ keys: quiet.key }), 'drawn-typst-quiet', written);
	return settingsFace([{ target: quiet.target, values: quiet.values.filter(Boolean) }], sourceHint(written));
}
