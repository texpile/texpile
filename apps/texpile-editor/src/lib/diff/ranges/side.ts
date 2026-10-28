// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/Side.kt

export enum Side {
	LEFT,
	RIGHT
}

export enum ThreeSide {
	LEFT,
	BASE,
	RIGHT
}

export function sideFromLeft(isLeft: boolean): Side {
	return isLeft ? Side.LEFT : Side.RIGHT;
}

export function otherSide(side: Side): Side {
	return side === Side.LEFT ? Side.RIGHT : Side.LEFT;
}

export function selectBySide<T>(side: Side, left: T, right: T): T {
	return side === Side.LEFT ? left : right;
}

export function selectByThreeSide<T>(side: ThreeSide, left: T, base: T, right: T): T {
	if (side === ThreeSide.LEFT) return left;
	if (side === ThreeSide.BASE) return base;
	return right;
}
