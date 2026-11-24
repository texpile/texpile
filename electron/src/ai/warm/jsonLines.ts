// One JSON message a line, as Claude Code's stream mode and Codex's app server print them
import type { Readable } from 'node:stream';

export type JsonMessage = Record<string, unknown>;

export function onJsonLines(stream: Readable | null, take: (msg: JsonMessage) => void): void {
	let pending = '';
	stream?.setEncoding('utf8').on('data', (d: string) => {
		pending += d;
		const lines = pending.split('\n');
		pending = lines.pop() ?? '';
		for (const line of lines) {
			let msg: unknown;
			try {
				msg = JSON.parse(line);
			} catch {
				continue;
			}
			if (msg && typeof msg === 'object') take(msg as JsonMessage);
		}
	});
}

export function writeJsonLine(stream: NodeJS.WritableStream | null | undefined, msg: object): void {
	stream?.write(JSON.stringify(msg) + '\n');
}
