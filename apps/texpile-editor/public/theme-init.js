// Apply the saved appearance before paint so there's no flash (see src/lib/theme.ts).
// Choice is light | dark | system (default); "system" follows the OS preference.
// External (not inline) so the packaged app's CSP can keep script-src 'self' with no inline allowance.
//
// The choice lives in the texpile:layout blob (its `theme` field - keep in step with
// src/lib/storage/layout.ts). This runs BEFORE the migration, so on the very first post-upgrade
// launch it also has to read the old bare texpile:mode key - one flashless launch is the whole
// point of this file, and that launch is exactly the one where only the old key exists.
try {
	var c = null;
	try {
		var layout = JSON.parse(localStorage.getItem('texpile:layout') || 'null');
		if (layout && layout.v === 1) c = layout.theme;
	} catch {
		/* fall through to the legacy key */
	}
	if (!c) c = localStorage.getItem('texpile:mode');
	var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
	var dark = c === 'dark' || ((c === 'system' || !c) && sysDark);
	document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
	if (dark) document.documentElement.classList.add('dark');

	// the theme's variables too, so a preset is on before the first paint: a static stylesheet
	// under /themes. Mirrors applyThemeName in src/lib/theme.ts, which finds the link in place
	// and leaves it.
	var name = (layout && layout.v === 1 && layout.themeName) || 'theme';
	if (/^[a-z][a-z0-9-]*$/.test(name) && name !== 'theme') {
		document.write('<link id="texpile-theme" rel="stylesheet" href="/themes/' + name + '.css">');
	} else name = 'theme';
	document.documentElement.setAttribute('data-theme', name);
} catch {
	/* no localStorage / matchMedia: fall back to the default light theme */
}
