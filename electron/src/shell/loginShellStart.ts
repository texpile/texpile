// how the terminal's shell starts on macOS: as a login shell whose PATH keeps the Toolchain folders in front
import * as fs from 'node:fs';
import * as path from 'node:path';

type ShellStart = { args: string[]; env: Record<string, string> };

// zsh reads each startup file from ZDOTDIR, so ours read the user's own from where ZDOTDIR pointed before
function zshFile(name: string, before?: string): string {
	const lines = ['TEXPILE_ZDOTDIR=$ZDOTDIR', 'ZDOTDIR=${TEXPILE_USER_ZDOTDIR:-$HOME}'];
	if (before) lines.push(before);
	lines.push(`[[ -r $ZDOTDIR/${name} ]] && builtin source $ZDOTDIR/${name}`, 'TEXPILE_USER_ZDOTDIR=$ZDOTDIR', 'ZDOTDIR=$TEXPILE_ZDOTDIR', '');
	return lines.join('\n');
}

// .zlogin is the last file a login shell reads, after .zshrc
const ZLOGIN = [
	'ZDOTDIR=$TEXPILE_USER_ZDOTDIR',
	'[[ -r $ZDOTDIR/.zlogin ]] && builtin source $ZDOTDIR/.zlogin',
	'[[ -n $TEXPILE_ZDOTDIR_UNSET && $ZDOTDIR == $HOME ]] && unset ZDOTDIR',
	'() { local -a front=(${(s.:.)TEXPILE_PATH_FRONT}); path=($front ${path:|front}) }',
	'unset TEXPILE_ZDOTDIR TEXPILE_USER_ZDOTDIR TEXPILE_ZDOTDIR_UNSET TEXPILE_PATH_FRONT',
	''
].join('\n');

const ZSH_FILES: Record<string, string> = {
	'.zshenv': zshFile('.zshenv'),
	'.zprofile': zshFile('.zprofile'),
	// /etc/zshrc set HISTFILE inside our folder; history belongs beside the user's own files
	'.zshrc': zshFile('.zshrc', '[[ $HISTFILE == $TEXPILE_ZDOTDIR/.zsh_history ]] && HISTFILE=$ZDOTDIR/.zsh_history'),
	'.zlogin': ZLOGIN
};

// bash ignores --init-file in a login shell, so this one starts interactive and reads what a login shell would
const BASH_INIT = [
	'[ -r /etc/profile ] && . /etc/profile',
	'if [ -r ~/.bash_profile ]; then . ~/.bash_profile',
	'elif [ -r ~/.bash_login ]; then . ~/.bash_login',
	'elif [ -r ~/.profile ]; then . ~/.profile',
	'fi',
	'__texpile_front() {',
	'\tlocal IFS=: d out=$TEXPILE_PATH_FRONT',
	'\tfor d in $PATH; do',
	'\t\tcase ":$TEXPILE_PATH_FRONT:" in *":$d:"*) ;; *) out=$out:$d ;; esac',
	'\tdone',
	'\tPATH=$out',
	'}',
	'__texpile_front',
	'unset -f __texpile_front',
	'unset TEXPILE_PATH_FRONT',
	''
].join('\n');

function writeAll(dir: string, files: Record<string, string>): void {
	fs.mkdirSync(dir, { recursive: true });
	for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
}

/**
 * Args and extra env for the shell. A login shell, as Terminal.app starts one: a Finder-launched app has only launchd's
 * bare PATH and /etc/paths.d (MacTeX's texbin) is read only by login startup. Its path_helper also moves the system's
 * folders in front of the ones listed in Preferences, so zsh and bash start through files in `dir` that put them back.
 */
export function loginShellStart(shellPath: string, front: string[], dir: string): ShellStart {
	if (process.platform !== 'darwin') return { args: [], env: {} };
	const shell = path.basename(shellPath);
	if (!front.length || (shell !== 'zsh' && shell !== 'bash')) return { args: ['-l'], env: {} };
	const env: Record<string, string> = { TEXPILE_PATH_FRONT: front.join(':') };
	if (shell === 'bash') {
		writeAll(dir, { 'bash-init': BASH_INIT });
		return { args: ['--init-file', path.join(dir, 'bash-init'), '-i'], env };
	}
	const zdot = path.join(dir, 'zsh');
	writeAll(zdot, ZSH_FILES);
	if (process.env.ZDOTDIR) env.TEXPILE_USER_ZDOTDIR = process.env.ZDOTDIR;
	else env.TEXPILE_ZDOTDIR_UNSET = '1';
	return { args: ['-l'], env: { ...env, ZDOTDIR: zdot } };
}
