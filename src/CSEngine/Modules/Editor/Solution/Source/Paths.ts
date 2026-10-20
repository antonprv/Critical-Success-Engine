// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Paths inside a project: relative to the project's folder, "/" between the parts, no leading or trailing "/", "" for the
 * folder itself. The same on every platform, so a .uisolution moves with the project.
 */

/** A path's folder ("" for one at the root). */
export function ParentOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "" : path.slice(0, slash);
}

/** A path's last part (the file or folder name). */
export function NameOf(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

export function Join(folder: string, name: string): string {
	return folder === "" ? name : `${folder}/${name}`;
}

/** Whether `path` is `folder` itself or inside it. */
export function IsWithin(path: string, folder: string): boolean {
	return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** `path` with its `from` prefix (itself or a folder above it) replaced by `to`; others are returned unchanged. */
export function Rebase(path: string, from: string, to: string): string {
	if (path === from) return to;
	if (from === "" || !path.startsWith(`${from}/`)) return path;
	return Join(to, path.slice(from.length + 1));
}

const Forbidden = /[\\/:*?"<>|]/;
const Reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Why `name` can't be a file or folder name on every platform the tools run on (null: it can). */
export function NameProblem(name: string): string | null {
	if (name.trim() === "") return "A name can't be empty";
	if (name === "." || name === "..") return `"${name}" is not a name`;
	if (Forbidden.test(name)) return `A name can't hold \\ / : * ? " < > |`;
	if (name.endsWith(".") || name.endsWith(" ")) return "A name can't end with a dot or a space";
	if (Reserved.test(name)) return `"${name}" is reserved by Windows`;
	return null;
}

/** Normalises a path the host gave ("a\\b/", "./a"): the form above. */
export function Normalize(path: string): string {
	return path.split(/[\\/]+/).filter((part) => part !== "" && part !== ".").join("/");
}

/** A glob over names: `*` any run of characters, `?` one; whole name, case-insensitive. */
export function MatchesPattern(name: string, pattern: string): boolean {
	let expression = Patterns.get(pattern);
	if (!expression) {
		const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
		expression = new RegExp(`^${source}$`, "i");
		Patterns.set(pattern, expression);
	}
	return expression.test(name);
}

const Patterns = new Map<string, RegExp>();

const Collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Explorer's order of names: case-insensitive, numbers by value ("File2" before "File10"). */
export function CompareNames(a: string, b: string): number {
	return Collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
