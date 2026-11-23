import { defineConfig } from '@playwright/test';
import { VITE_PORT } from './tests/integration/driver/ports';

// a spec named guest*.spec.ts joins as the browser guest (the web build) in Firefox and WebKit; every other spec drives the app
const GUEST_SPECS = /^(?!.*canvas[\\/]).*[\\/]guest\w*\.spec\.ts$/;
// the canvas specs of the textarea input surface, run on the harness page in Chromium without EditContext, Firefox and WebKit
const BROWSER_SPECS = /canvas[\\/](ime|guestSmoke)\.spec\.ts$/;
const GUEST_PORT = VITE_PORT + 1;

// the canvas specs that also run on the harness page in Chromium (project canvas-web), which launches no Electron
const HARNESS_SPECS =
	/canvas[\\/](coreSmoke|caretChecks|keyParity|keyRules|caretMargin|themeTokens|darkModeRepaint|scrollAnchoring|firstScreenStyles)\.spec\.ts$|canvas[\\/]math[\\/]\w+\.spec\.ts$|canvas[\\/]slice[\\/](w2|w4|w5|w7|w9)\.spec\.ts$|canvas[\\/]feedback[\\/](typingLatency|scrollSmooth)\.spec\.ts$|canvas[\\/](pointer|ime|hitParity|guestSmoke)\.spec\.ts$|[\\/]caretWalk\.spec\.ts$|(chipsAndMath|macroArguments)\.spec\.ts$/;
// the slice specs whose looks Firefox and WebKit draw from the same canvas code
const HARNESS_GUEST_SPECS = /canvas[\\/]slice[\\/](w4|w7|w9)\.spec\.ts$|canvas[\\/](coreSmoke|firstScreenStyles)\.spec\.ts$/;

/** a run that names only the harness project needs no Electron build */
function runsOnlyHarness(args: readonly string[]): boolean {
	return (
		args.some((arg) => /^(--project=)?canvas-(web|textarea|firefox|webkit)/.test(arg)) &&
		!args.some((arg) => /^(app|guest-\w+)$|^--project=(app|guest)/.test(arg))
	);
}

/** a run that names only app projects or app specs skips the web build */
function runsGuestSpecs(args: readonly string[]): boolean {
	const projects = args.flatMap((arg, i) => (arg === '--project' ? [args[i + 1]] : arg.startsWith('--project=') ? [arg.slice(10)] : []));
	if (projects.length) return projects.some((name) => name?.startsWith('guest'));
	const files = args.filter((arg) => /\.spec\.ts|[\\/]/.test(arg) && !arg.startsWith('-'));
	return !files.length || files.some((file) => /guest/i.test(file));
}

// the real app: Electron on the Vite dev server, each spec file typing into its own copy of tests/integration/fixture
export default defineConfig({
	testDir: 'tests/integration',
	testMatch: /\.spec\.ts$/,
	timeout: 120_000,
	expect: { timeout: 10_000 },
	workers: process.env.CI ? 2 : 3,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/integration/report' }]],
	outputDir: 'tests/integration/results',
	globalSetup: runsOnlyHarness(process.argv.slice(2)) ? undefined : './tests/integration/driver/globalSetup.ts',
	projects: [
		{ name: 'app', testIgnore: GUEST_SPECS },
		{ name: 'canvas-web', testMatch: HARNESS_SPECS, use: { browserName: 'chromium' } },
		{ name: 'canvas-web-firefox', testMatch: HARNESS_GUEST_SPECS, use: { browserName: 'firefox' } },
		{ name: 'canvas-web-webkit', testMatch: HARNESS_GUEST_SPECS, use: { browserName: 'webkit' } },
		{ name: 'canvas-textarea', testMatch: BROWSER_SPECS, use: { browserName: 'chromium' } },
		{ name: 'canvas-firefox', testMatch: BROWSER_SPECS, use: { browserName: 'firefox' } },
		{ name: 'canvas-webkit', testMatch: BROWSER_SPECS, use: { browserName: 'webkit', hasTouch: true } },
		{ name: 'guest-firefox', testMatch: GUEST_SPECS, use: { browserName: 'firefox', baseURL: `http://127.0.0.1:${GUEST_PORT}` } },
		{ name: 'guest-webkit', testMatch: GUEST_SPECS, use: { browserName: 'webkit', baseURL: `http://127.0.0.1:${GUEST_PORT}` } }
	],
	webServer: [
		{
			command: `vite dev --host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
			url: `http://127.0.0.1:${VITE_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000
		},
		...(runsGuestSpecs(process.argv.slice(2))
			? [
					{
						command: `vite build --mode web --outDir dist-web --emptyOutDir && vite preview --outDir dist-web --host 127.0.0.1 --port ${GUEST_PORT} --strictPort`,
						url: `http://127.0.0.1:${GUEST_PORT}`,
						reuseExistingServer: !process.env.CI,
						timeout: 300_000
					}
				]
			: [])
	]
});
