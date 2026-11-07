import { readArgs, rolesOf, type CallArgument } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { Argument, Role } from '$lib/languages/latex/knowledge/types';
import type { NumberStyle } from '$lib/languages/latex/visual/extensions/numbers/printedNumber';
import { m } from '$lib/paraglide/messages';
import { ownMacroDefined, ownRegisterDefined } from '../own/ownMacroFace.svelte';
import { commandAt, oneLine } from './texSource';
import { definesSomething, isMandatory, readingOf, readsWhole } from './readDefinition';
import { registerValueEnd } from '$lib/languages/latex/parser/tree/walk/registerValue';

export type ReadSetting = {
	target: string;
	values: string[];
	end: number;
};

const PRINTED: Role[] = ['text', 'label', 'citekey', 'file', 'listing', 'graphic', 'bibfile', 'url', 'glossary', 'acronym', 'unit'];

const TARGETS: Partial<Record<Role, () => string>> = {
	pagestyle: m.drawn_chip_latex_set_pagestyle,
	language: m.drawn_chip_latex_set_language,
	package: m.drawn_chip_latex_set_package
};

const SETTING_ROLES: Role[] = ['counter', 'pagestyle', 'language', 'package', 'dir'];

const PRINTS_COUNTER: (NumberStyle | 'value')[] = ['arabic', 'Alph', 'alph', 'Roman', 'roman', 'fnsymbol', 'value'];

function quietReading(name: string, reading: Argument[]): boolean {
	const facts = commonFacts(name);
	return (
		!facts.prints &&
		facts.section == null &&
		!definesSomething(reading) &&
		!reading.some((a) => rolesOf(a).some((role) => PRINTED.includes(role)))
	);
}

function setsWith(name: string, reading: Argument[]): boolean {
	if (!quietReading(name, reading)) return false;
	if (commonFacts(name).prints === '') return true;
	if (!reading.length) return commonFacts(name).declares === 'align';
	const roles = reading.flatMap(rolesOf);
	if (roles.includes('counter')) return !(PRINTS_COUNTER as string[]).includes(name);
	if (SETTING_ROLES.some((role) => roles.includes(role))) return true;
	const mandatory = reading.filter(isMandatory);
	if (!mandatory.length) return reading.some((a) => a.keys);
	return mandatory.every((a) => a.keys) || mandatory.every((a) => a.values);
}

function mayTakeRegister(name: string, reading: Argument[]): boolean {
	return quietReading(name, reading) && !reading.some((a) => a.role) && reading.filter(isMandatory).length === 2;
}

function holdsRegister(src: string, arg: CallArgument | undefined): boolean {
	const text = arg ? src.slice(arg.from, arg.to).trim() : '';
	const command = commandAt(text, 0);
	return (
		!!command &&
		command.to === text.length &&
		(commonFacts(command.name).register != null || ownMacroDefined(command.name) || ownRegisterDefined(command.name))
	);
}

export function startsSetting(name: string): boolean {
	if (commonFacts(name).register != null) return true;
	const reading = readingOf(name);
	return !!reading && (setsWith(name, reading) || mayTakeRegister(name, reading));
}

// \PassOptionsToPackage names a package it does not load
function labelRole(arg: Argument): Role | undefined {
	return rolesOf(arg).find((role) => TARGETS[role] && (role !== 'package' || arg.loads));
}

function valueOf(src: string, arg: CallArgument): string {
	return oneLine(src.slice(arg.from, arg.to));
}

export function readSetting(src: string, command: string, nameEnd: number): ReadSetting | null {
	if (commonFacts(command).register != null) {
		const end = registerValueEnd(src, nameEnd, commonFacts(command).register);
		return end === null ? null : { target: command, values: [oneLine(src.slice(nameEnd, end).replace(/^\s*=?\s*/, ''))], end };
	}
	const reading = readingOf(command);
	if (!reading) return null;
	const sets = setsWith(command, reading);
	if (!sets && !mayTakeRegister(command, reading)) return null;
	const { end, args } = readArgs(src, nameEnd, { args: reading });
	if (!readsWhole(reading, args)) return null;
	if (
		!sets &&
		!holdsRegister(
			src,
			args.find((a) => isMandatory(a.arg))
		)
	)
		return null;
	const labelled = args.find((a) => labelRole(a.arg));
	const role = labelled && labelRole(labelled.arg);
	const ordered = labelled ? [labelled, ...args.filter((a) => a !== labelled)] : args;
	const values = ordered
		.filter((a) => a.arg.kind !== 's')
		.map((a) => valueOf(src, a))
		.filter(Boolean);
	return { target: role ? TARGETS[role]!() : command, values, end };
}
