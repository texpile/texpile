import { installedFonts } from '../fonts/installedFonts';
import { handleFs } from './ipcResult';

export function registerFontsIpc(): void {
	handleFs('fonts:list', () => installedFonts());
}
