import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { explainDrawError } from './engineMissing';

// a preamble being typed restarts TeX once it rests this long, not on every key
const PREAMBLE_SETTLE_MS = 800;

/** TikZ drawn by the user's own lualatex, kept warm in the main process while a figure tab is open */
export function desktopTikzEngine(where: { root: () => string; preamble: () => Promise<string> }): FigureEngine {
	let warm: string | null = null;
	let last: { root: string; preamble: string; job: string; drawn: Promise<unknown> } | null = null;
	async function settledPreamble(): Promise<string> {
		let preamble = await where.preamble();
		while (warm !== null && preamble !== warm) {
			await new Promise((r) => setTimeout(r, PREAMBLE_SETTLE_MS));
			const now = await where.preamble();
			if (now === preamble) break;
			preamble = now;
		}
		return (warm = preamble);
	}
	return {
		render: async (job) => {
			const draw = nativeBridge()?.drawRender;
			if (!draw) throw new Error('Figures need Texpile Desktop.');
			const root = where.root();
			const preamble = await settledPreamble();
			// typing elsewhere in the file asks again for the same picture
			if (last && last.root === root && last.preamble === preamble && last.job === job) return last.drawn;
			const drawn = draw({ root, preamble, picture: job }).catch((e: unknown) => {
				throw explainDrawError(e);
			});
			last = { root, preamble, job, drawn };
			drawn.catch(() => (last = null));
			return drawn;
		},
		readFont: async (path) => {
			const bytes = await nativeBridge()!.drawFile!(path);
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		},
		reset: () => {
			last = null;
			warm = null;
			void nativeBridge()?.drawStop?.();
		}
	};
}
