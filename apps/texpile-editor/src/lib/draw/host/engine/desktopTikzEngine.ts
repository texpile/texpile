import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { nativeBridge } from '$lib/workspace/fileSystem';

/** TikZ drawn by the user's own lualatex, kept warm in the main process while a figure tab is open */
export function desktopTikzEngine(where: { root: () => string; preamble: () => Promise<string> }): FigureEngine {
	return {
		render: async (job) => {
			const draw = nativeBridge()?.drawRender;
			if (!draw) throw new Error('Figures need Texpile Desktop.');
			return draw({ root: where.root(), preamble: await where.preamble(), picture: job });
		},
		readFont: async (path) => {
			const bytes = await nativeBridge()!.drawFile!(path);
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		},
		reset: () => void nativeBridge()?.drawStop?.()
	};
}
