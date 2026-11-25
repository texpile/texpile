// the first frame waits for the fonts its visible blocks use and the formula fonts; a face finishing later relays
// what is on screen, and the widths measured with its fallback are forgotten
/** the KaTeX faces MathLive draws formulas with, in the weights and styles its glyphs use */
export const FORMULA_FONTS: readonly string[] = [
	'16px KaTeX_Main',
	'italic 16px KaTeX_Main',
	'bold 16px KaTeX_Main',
	'italic 16px KaTeX_Math',
	'16px KaTeX_AMS',
	'16px KaTeX_Size1',
	'16px KaTeX_Size2'
];

/** loads every canvas font string, settling after timeoutMs whatever is still pending */
export async function loadFonts(fonts: FontFaceSet, specs: readonly string[], timeoutMs = 3000): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const settled = Promise.allSettled(specs.map((spec) => fonts.load(spec)));
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, timeoutMs);
	});
	await Promise.race([settled, timeout]);
	clearTimeout(timer);
}

/** the family names of the faces that finished loading, after each loadingdone */
export function watchFontLoads(fonts: FontFaceSet, loaded: (families: string[]) => void): () => void {
	function onDone(event: Event): void {
		const faces = (event as FontFaceSetLoadEvent).fontfaces ?? [];
		const families = [...new Set(faces.map((face) => face.family.replace(/^["']|["']$/g, '')))];
		if (families.length) loaded(families);
	}
	fonts.addEventListener('loadingdone', onDone);
	return () => fonts.removeEventListener('loadingdone', onDone);
}
