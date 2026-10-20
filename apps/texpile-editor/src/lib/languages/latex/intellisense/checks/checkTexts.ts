import { m } from '$lib/paraglide/messages';
import type { LatexCheckId } from './checkSwitches';

export function checkName(id: LatexCheckId): string {
	switch (id) {
		case 'undefined-command':
			return m.latex_check_undefined_command();
		case 'engine':
			return m.latex_check_engine();
		case 'unknown-option':
			return m.latex_check_unknown_option();
		case 'package-clash':
			return m.latex_check_package_clash();
	}
}

export function checkNote(id: LatexCheckId): string {
	switch (id) {
		case 'undefined-command':
			return m.latex_check_undefined_command_note();
		case 'engine':
			return m.latex_check_engine_note();
		case 'unknown-option':
			return m.latex_check_unknown_option_note();
		case 'package-clash':
			return m.latex_check_package_clash_note();
	}
}
