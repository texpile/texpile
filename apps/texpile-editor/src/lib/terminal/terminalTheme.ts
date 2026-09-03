// xterm's colours for the mode we are in. The ground and text come from the theme through the
// colour bridge; the sixteen ANSI colours are VS Code's stock sets, hand-picked per light and dark
// rather than derived from a palette, so red is red on every theme. Readability on any ground is
// xterm's job: the minimumContrastRatio set where the terminal is created.
import type { ITheme } from '@xterm/xterm';
import { themeColour } from '$lib/languages/typst/preview/themeColour';

const ANSI_DARK = {
	black: '#000000',
	red: '#cd3131',
	green: '#0dbc79',
	yellow: '#e5e510',
	blue: '#2472c8',
	magenta: '#bc3fbc',
	cyan: '#11a8cd',
	white: '#e5e5e5',
	brightBlack: '#666666',
	brightRed: '#f14c4c',
	brightGreen: '#23d18b',
	brightYellow: '#f5f543',
	brightBlue: '#3b8eea',
	brightMagenta: '#d670d6',
	brightCyan: '#29b8db',
	brightWhite: '#e5e5e5'
};

const ANSI_LIGHT = {
	black: '#000000',
	red: '#cd3131',
	green: '#107c10',
	yellow: '#949800',
	blue: '#0451a5',
	magenta: '#bc05bc',
	cyan: '#0598bc',
	white: '#555555',
	brightBlack: '#666666',
	brightRed: '#cd3131',
	brightGreen: '#14ce14',
	brightYellow: '#b5ba00',
	brightBlue: '#0451a5',
	brightMagenta: '#bc05bc',
	brightCyan: '#0598bc',
	brightWhite: '#a5a5a5'
};

export function terminalTheme(mode: 'light' | 'dark'): ITheme {
	const dark = mode === 'dark';
	const background = themeColour('--terminal-bg', dark ? '#1e1e1e' : '#ffffff');
	const foreground = themeColour('--terminal-fg', dark ? '#e4e4e7' : '#333333');
	return { background, foreground, cursor: foreground, cursorAccent: background, ...(dark ? ANSI_DARK : ANSI_LIGHT) };
}
