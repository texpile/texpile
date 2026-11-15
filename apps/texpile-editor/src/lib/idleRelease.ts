/** `touch` puts `release` off by `ms`; when the time is up and `busy` still holds, it waits again */
export function idleRelease(ms: number, busy: () => boolean, release: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return function touch() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			if (busy()) touch();
			else release();
		}, ms);
	};
}
