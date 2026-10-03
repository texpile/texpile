// Editor preferences facade. The old texpile:preferences blob is gone (migrated); its fields now
// live where they belong - zoom / pageView / previewVisible in texpile:layout (how the window
// looks), the dismissal flag in texpile:users (the user's own memory). The
// EditorPreferences shape survives as a facade so the editors keep one object to read and write.
import { browser } from '$lib/runtime';
import { layout, updateLayout } from '$lib/storage/layout';
import { userData, updateUserData } from '$lib/storage/userData';

export type EditorPreferences = {
	/** editor zoom level (1 = 100%). */
	zoom: number;
	/** renders the editor in a paper-like container. */
	pageView: boolean;
	previewVisible: boolean;
	sidebarOpen: boolean;
	advancedWarningDismissed: boolean;
};

function snapshot(): EditorPreferences {
	const l = layout.current;
	const u = userData.current;
	return {
		zoom: l.editorZoom,
		pageView: l.pageView,
		previewVisible: l.previewVisible,
		sidebarOpen: l.sidebarOpen,
		advancedWarningDismissed: u.advancedWarningDismissed
	};
}

export const preferences = $state<EditorPreferences>(
	browser
		? snapshot()
		: {
				zoom: 1,
				pageView: false,
				previewVisible: true,
				sidebarOpen: true,
				advancedWarningDismissed: false
			}
);

// auto-save on change, each field into its home store (debounced like the old blob was)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
$effect.root(() => {
	$effect(() => {
		const snap = {
			zoom: preferences.zoom,
			pageView: preferences.pageView,
			previewVisible: preferences.previewVisible,
			sidebarOpen: preferences.sidebarOpen,
			advancedWarningDismissed: preferences.advancedWarningDismissed
		};
		if (!browser) return;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			updateLayout({ editorZoom: snap.zoom, pageView: snap.pageView, previewVisible: snap.previewVisible, sidebarOpen: snap.sidebarOpen });
			updateUserData({ advancedWarningDismissed: snap.advancedWarningDismissed });
		}, 100);
	});
});
