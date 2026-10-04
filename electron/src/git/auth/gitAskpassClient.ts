// The askpass pieces with no Electron in them, kept apart from gitAskpass.ts so the tests can run
// them: the scripts git and ssh execute, the environment that points them there, and what a
// question they pass on is asking.
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export type AskpassRequest = {
	/** a visible answer (a username), a hidden one (a password, token or passphrase), or yes / no */
	input: 'text' | 'secret' | 'confirm';
	/** what the answer is, which decides the wording around it */
	subject: 'username' | 'password' | 'passphrase' | 'host-key' | 'other';
	/** exactly what git or ssh printed, shown as it came */
	prompt: string;
	/** the host being signed in to, when the prompt names one */
	host: string | null;
};

/** git's own two https questions, whole. Only these name a host: a username with a quote in it
 *  (git before its prompt sanitising, or with it turned off) could otherwise make the first quoted
 *  part of `Password for 'https://<user>@<host>':` read as a host it is not. */
const GIT_HTTPS_PROMPT = /^(?:Username|Password) for '([^']*)':$/i;

/** the address inside git's "Username for 'https://user@example.com:8443':", or null when its host
 *  is in doubt. git before its prompt sanitising writes the user and, with credential.useHttpPath,
 *  the path unescaped: a user of `github.com/` makes a plain reading take github.com for the host,
 *  and an @ in the path makes the last @ miss it. Only a host both readings agree on is named */
function urlOfPrompt(text: string): URL | null {
	const quoted = GIT_HTTPS_PROMPT.exec(text)?.[1];
	const parts = quoted ? /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(quoted) : null;
	if (!quoted || !parts) return null;
	const rest = parts[2];
	try {
		const url = new URL(`${parts[1]}://${rest.slice(rest.lastIndexOf('@') + 1)}`);
		return new URL(quoted).host === url.host ? url : null;
	} catch {
		return null;
	}
}

/** git asking about https://github.com itself, the one place the GitHub account may answer: not
 *  plain http (the token would cross the network in the clear) and not another port */
export function isGithubHttpsPrompt(prompt: string): boolean {
	const url = urlOfPrompt(prompt.trim());
	return !!url && url.protocol === 'https:' && url.hostname === 'github.com' && url.port === '';
}

/**
 * git asks `Username for 'https://github.com': ` and `Password for 'https://me@github.com': `;
 * ssh asks for a key's passphrase, a password (`me@host's password: `), or whether to trust a host
 * it has not seen, which is a yes / no question whatever its wording. `promptType` is ssh's
 * SSH_ASKPASS_PROMPT: 'confirm' for a yes / no question it knows is one.
 */
export function describePrompt(kind: 'https' | 'ssh', prompt: string, promptType = ''): AskpassRequest {
	const text = prompt.trim();
	const quoted = /'([^']+)'/.exec(text)?.[1] ?? null;

	if (kind === 'https') {
		const host = urlOfPrompt(text)?.hostname || null;
		if (/^username/i.test(text)) return { input: 'text', subject: 'username', prompt: text, host };
		if (/^password/i.test(text)) return { input: 'secret', subject: 'password', prompt: text, host };
		return { input: 'secret', subject: 'other', prompt: text, host };
	}

	if (promptType === 'confirm' || /\(yes\/no/i.test(text)) {
		// "The authenticity of host 'github.com (140.82.121.4)' can't be established."
		const host = quoted ? quoted.replace(/\s*\(.*\)$/, '') : null;
		return { input: 'confirm', subject: 'host-key', prompt: text, host };
	}
	if (/passphrase/i.test(text)) return { input: 'secret', subject: 'passphrase', prompt: text, host: null };
	// "me@example.com's password:"
	const login = /^\S+@([^'\s]+)'s password/i.exec(text);
	if (login) return { input: 'secret', subject: 'password', prompt: text, host: login[1] };
	return { input: 'secret', subject: 'other', prompt: text, host: null };
}

// The scripts are written out at first use rather than shipped: git has to execute them, and
// nothing inside the asar can be executed. mktemp + cat is VS Code's arrangement too - an Electron
// binary's stdout does not reliably reach git on Windows, a file does.
function shellScript(kind: 'https' | 'ssh'): string {
	return `#!/bin/sh
# Texpile ${kind === 'https' ? 'GIT_ASKPASS' : 'SSH_ASKPASS'}: hands the question to the Texpile window that started the operation
TEXPILE_ASKPASS_OUT=\`mktemp\`
ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ATTACH_CONSOLE=1 TEXPILE_ASKPASS_KIND=${kind} TEXPILE_ASKPASS_OUT="$TEXPILE_ASKPASS_OUT" "$TEXPILE_ASKPASS_NODE" "$TEXPILE_ASKPASS_MAIN" "$@"
code=$?
cat "$TEXPILE_ASKPASS_OUT"
rm -f "$TEXPILE_ASKPASS_OUT"
exit $code
`;
}

// plain CommonJS for Electron's own node; a missing or closed answer exits 1, which git reads as
// "could not read the password" and stops
export const MAIN_JS = `'use strict';
const net = require('net');
const fs = require('fs');
const env = process.env;
const socket = net.connect(env.TEXPILE_ASKPASS_HANDLE);
let buf = '';
function done(code) {
	socket.destroy();
	process.exit(code);
}
socket.setEncoding('utf8');
socket.on('connect', () => {
	const req = { token: env.TEXPILE_ASKPASS_TOKEN, kind: env.TEXPILE_ASKPASS_KIND, prompt: process.argv.slice(2).join(' '), promptType: env.SSH_ASKPASS_PROMPT || '' };
	socket.write(JSON.stringify(req) + '\\n');
});
socket.on('data', (chunk) => {
	buf += chunk;
	const nl = buf.indexOf('\\n');
	if (nl === -1) return;
	let reply;
	try {
		reply = JSON.parse(buf.slice(0, nl));
	} catch {
		return done(1);
	}
	if (typeof reply.answer !== 'string') return done(1);
	fs.writeFileSync(env.TEXPILE_ASKPASS_OUT, reply.answer + '\\n');
	done(0);
});
socket.on('error', () => done(1));
socket.on('end', () => done(1));
`;

/** write the scripts into `dir`, replacing whatever an older version left there */
export function writeAskpassScripts(dir: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'askpass-main.js'), MAIN_JS);
	for (const [file, kind] of [
		['askpass.sh', 'https'],
		['ssh-askpass.sh', 'ssh']
	] as const) {
		writeFileSync(join(dir, file), shellScript(kind));
		chmodSync(join(dir, file), 0o755);
	}
}

/** What a git has to be run with for its questions to reach `handle`. `node` is the binary that
 *  runs askpass-main.js: the app's own executable under ELECTRON_RUN_AS_NODE, or plain node. */
export function askpassEnv(dir: string, handle: string, token: string, node: string): Record<string, string> {
	return {
		GIT_ASKPASS: join(dir, 'askpass.sh'),
		SSH_ASKPASS: join(dir, 'ssh-askpass.sh'),
		// OpenSSH 8.4+: use the askpass even with no DISPLAY (older ones fall back to the agent)
		SSH_ASKPASS_REQUIRE: 'force',
		TEXPILE_ASKPASS_NODE: node,
		TEXPILE_ASKPASS_MAIN: join(dir, 'askpass-main.js'),
		TEXPILE_ASKPASS_HANDLE: handle,
		TEXPILE_ASKPASS_TOKEN: token
	};
}
