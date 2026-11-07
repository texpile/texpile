import { commentFace } from '$lib/editor/visual/extensions/drawnChips/commentFace';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { environmentPlugins } from '../plugin/pluginMap';
import type { LatexFaceCore } from '../plugin/latexPlugin';

const WHOLE = /^\s*\\begin\{([^{}]+)\}([\s\S]*)\\end\{([^{}]+)\}\s*$/;

export function wholeEnvironmentFace(source: string, core: LatexFaceCore): ChipFace | null {
	const whole = WHOLE.exec(source);
	if (!whole || whole[1] !== whole[3]) return null;
	const name = whole[1];
	if (commonEnvFacts(name).body === 'comment') {
		const body = whole[2].trim();
		return commentFace(body ? body.split('\n').map((line) => line.trim()) : [], name === 'comment' ? '%' : name);
	}
	for (const plugin of environmentPlugins(name)) {
		const answer = plugin.face?.({ kind: 'whole', name, source }, core);
		if (answer && !Array.isArray(answer)) return answer;
	}
	return null;
}
