// Button order for a native message box, per platform, the way VS Code massages its own.
//
// The renderer always sends "primary first, cancel last". Windows shows arrays as given, which is
// its HIG. macOS lays the first button on the trailing edge and the rest leftwards, and from
// macOS 15 puts the cancel button beside it on its own; older macOS needed cancel at index 1 for
// that layout. GNOME wants cancel FIRST, before the affirmative, so Linux gets the array
// reversed. Electron reorders nothing itself.
import { release } from 'node:os';

export type OrderedButtons = {
	buttons: string[];
	defaultId: number;
	cancelId: number | undefined;
	/** the caller's index for each shown button, so the answer maps back */
	original: number[];
};

export function orderForPlatform(buttons: readonly string[], cancelId: number | undefined, platform = process.platform): OrderedButtons {
	let shown = [...buttons];
	let original = buttons.map((_, i) => i);
	let cancel = cancelId;
	const legacyMac = platform === 'darwin' && Number.parseInt(release(), 10) < 24; // macOS 15 is Darwin 24
	if (shown.length > 1 && cancel !== undefined && (platform === 'linux' || legacyMac) && cancel !== 1) {
		const [label] = shown.splice(cancel, 1);
		const [index] = original.splice(cancel, 1);
		shown.splice(1, 0, label);
		original.splice(1, 0, index);
		cancel = 1;
	}
	if (platform === 'linux' && shown.length > 1) {
		shown = shown.reverse();
		original = original.reverse();
		cancel = cancel === undefined ? undefined : shown.length - 1 - cancel;
	}
	return { buttons: shown, defaultId: original.indexOf(0), cancelId: cancel, original };
}
