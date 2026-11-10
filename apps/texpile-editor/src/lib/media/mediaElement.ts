const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;

export function mediaElementOf(path: string): 'audio' | 'video' {
	return AUDIO_EXT.test(path) ? 'audio' : 'video';
}

/** 0:05, 3:07, 1:02:09 */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return '';
	const s = Math.round(seconds);
	const h = Math.floor(s / 3600);
	const min = Math.floor((s % 3600) / 60);
	return h ? `${h}:${pad2(min)}:${pad2(s % 60)}` : `${min}:${pad2(s % 60)}`;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}
