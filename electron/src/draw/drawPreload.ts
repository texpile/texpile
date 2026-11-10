import { invokeFs } from '../preloadIpc';

export const drawBridge = {
	drawRender: (body: { root: string; preamble: string; picture: string }) => invokeFs('draw:render', body),
	drawCetz: (body: { root: string; path: string; job: string }) => invokeFs('draw:cetz', body),
	drawStop: () => invokeFs('draw:stop'),
	drawRestart: () => invokeFs('draw:restart'),
	drawFile: (reported: string) => invokeFs('draw:file', reported),
	figureRead: (name: string) => invokeFs('figures:read', name),
	figureWrite: (name: string, svg: string) => invokeFs('figures:write', name, svg)
};
