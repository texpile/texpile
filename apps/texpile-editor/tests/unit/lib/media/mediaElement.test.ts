import { expect, it } from 'vitest';
import { fileKind } from '$lib/workspace/documentBuffer.svelte';
import { formatDuration, mediaElementOf } from '$lib/media/mediaElement';

it('opens video and audio in the player and other video formats as binary', () => {
	expect(['clip.MP4', 'talk.mov', 'song.mp3', 'take.flac'].map(fileKind)).toEqual(['media', 'media', 'media', 'media']);
	expect(fileKind('old.avi')).toBe('binary');
	expect(['clip.mp4', 'voice.ogg', 'film.webm'].map(mediaElementOf)).toEqual(['video', 'audio', 'video']);
});

it('writes a length as the player does', () => {
	expect([5, 187, 3729, NaN].map(formatDuration)).toEqual(['0:05', '3:07', '1:02:09', '']);
});
