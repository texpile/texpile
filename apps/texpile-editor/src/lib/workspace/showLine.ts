const SHOW_LINE = 'texpile:show-line';

type ShowLineDetail = { path: string; line: number };

export function requestShowLine(path: string, line: number): void {
	dispatchEvent(new CustomEvent<ShowLineDetail>(SHOW_LINE, { detail: { path, line } }));
}

export function onShowLine(show: (path: string, line: number) => void): () => void {
	function listen(e: Event): void {
		const { path, line } = (e as CustomEvent<ShowLineDetail>).detail;
		show(path, line);
	}
	addEventListener(SHOW_LINE, listen);
	return () => removeEventListener(SHOW_LINE, listen);
}
