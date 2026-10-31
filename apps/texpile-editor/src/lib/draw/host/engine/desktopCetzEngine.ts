import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { explainDrawError } from './engineMissing';

/** CeTZ drawn by the user's own tinymist, kept warm in the main process while a figure tab is open */
export function desktopCetzEngine(): FigureEngine {
	let last: { job: string; drawn: Promise<unknown> } | null = null;
	return {
		render: async (job) => {
			const draw = nativeBridge()?.drawCetz;
			if (!draw) throw new Error('Figures need Texpile Desktop.');
			// typing elsewhere in the file asks again for the same picture
			if (last?.job === job) return last.drawn;
			const drawn = draw(job).catch((e: unknown) => {
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
