import { defineConfig } from '@playwright/test';
import { VITE_PORT } from './tests/integration/driver/ports';

// the real app: Electron on the Vite dev server, each spec file typing into its own copy of tests/integration/fixture
export default defineConfig({
	testDir: 'tests/integration',
	testMatch: /\.spec\.ts$/,
	timeout: 120_000,
	expect: { timeout: 10_000 },
	workers: process.env.CI ? 2 : 3,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/integration/report' }]],
	outputDir: 'tests/integration/results',
	globalSetup: './tests/integration/driver/globalSetup.ts',
	webServer: {
		command: `vite dev --host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
		url: `http://127.0.0.1:${VITE_PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
