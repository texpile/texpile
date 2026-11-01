import { invokeFs } from '../preloadIpc';

export const imageBridge = {
	imageKeepOriginal: (path: string) => invokeFs('image:keepOriginal', path),
	imageNoteWritten: (path: string) => invokeFs('image:noteWritten', path),
	imageOriginalAt: (path: string) => invokeFs('image:originalAt', path),
	imageRestoreOriginal: (path: string) => invokeFs('image:restoreOriginal', path)
};
