import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { explainDrawError } from './engineMissing';

export function desktopCetzEngine(where: { root: () => string; path: string }): FigureEngine {
	let last: { job: string; drawn: Promise<unknown> } | null = null;
	return {
		render: async (job) => {
			const draw = nativeBridge()?.drawCetz;
			if (!draw) throw new Error('Figures need Texpile Desktop.');
			if (last?.job === job) return last.drawn;
			const drawn = draw({ root: where.root(), path: where.path, job }).catch((e: unknown) => {
				throw explainDrawError(e);
			});
			last = { job, drawn };
			drawn.catch(() => (last = null));
			return drawn;
		},
		readFont: async () => new ArrayBuffer(0),
		reset: () => {
			last = null;
			void nativeBridge()?.drawRestart?.();
		}
	};
}
