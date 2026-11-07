export class SourceText {
	readonly text: string;
	// where a \r was dropped before the \n at that offset
	private readonly dropped: number[] = [];

	constructor(readonly original: string) {
		if (!original.includes('\r')) {
			this.text = original;
			return;
		}
		let text = '';
		for (let i = 0; i < original.length; i++) {
			const ch = original[i];
			if (ch === '\r' && original[i + 1] === '\n') this.dropped.push(text.length);
			else text += ch === '\r' ? '\n' : ch;
		}
		this.text = text;
	}

	at(offset: number): number {
		const d = this.dropped;
		if (d.length === 0) return offset;
		let lo = 0;
		let hi = d.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (d[mid] < offset) lo = mid + 1;
			else hi = mid;
		}
		return offset + lo;
	}

	lineStart(offset: number): number {
		return this.text.lastIndexOf('\n', offset - 1) + 1;
	}

	lineEnd(offset: number): number {
		const nl = this.text.indexOf('\n', offset);
		return nl < 0 ? this.text.length : nl;
	}
}
