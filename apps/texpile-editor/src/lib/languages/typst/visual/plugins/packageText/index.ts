import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { packageFace } from './packageFace';

export const packageText: TypstPlugin = {
	role: (use) => use.form !== 'set' && use.origin === 'package',
	face: (core) => packageFace(core.source, core.drawByName)
};
