export type MathlivePlugin = typeof import('$lib/editor/visual/extensions/mathlivebridge/mlplugin');

let loaded: MathlivePlugin | null = null;

/** the module once one editor has loaded it, so a later editor is built before its first paint, not one empty frame after */
export function mathliveLoaded(): MathlivePlugin | null {
	return loaded;
}

export async function loadMathlive(): Promise<MathlivePlugin> {
	return (loaded ??= await import('$lib/editor/visual/extensions/mathlivebridge/mlplugin'));
}
