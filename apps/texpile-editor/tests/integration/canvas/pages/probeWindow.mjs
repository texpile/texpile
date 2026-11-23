// an Electron window on the page a spec names, so a page test runs in the app's own Chromium
import { app, BrowserWindow } from 'electron';

app.whenReady().then(() => {
	const window = new BrowserWindow({ width: 1280, height: 860, show: false });
	window.loadURL(process.env.PROBE_URL);
});
