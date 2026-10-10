// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * A project's list of UI documents (Ui.manifest.json, next to the .ui.json files): the UI designer writes it, scripts
 * show documents by their Id through UiManager.
 */

export interface UiManifestEntry {
	/** What scripts call it: Ui.Show("PauseMenu"). */
	Id: string;
	/** The .ui.json file, relative to the manifest. */
	Path: string;
	/** A UiScript to run instead of the one the layout names ("" keeps the layout's). */
	Script: string;
}

export interface UiManifest {
	FileVersion: number;
	Documents: UiManifestEntry[];
}

class ManifestError extends Error {
	public constructor(reason: string) {
		super(`Not a UI manifest: ${reason}`);
	}
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ReadEntry(raw: unknown): UiManifestEntry {
	if (!IsObject(raw) || typeof raw["Id"] !== "string") throw new ManifestError("a document has no Id");
	const id = raw["Id"];
	if (!Identifier.test(id)) throw new ManifestError(`Id "${id}" must be an identifier`);
	if (typeof raw["Path"] !== "string") throw new ManifestError(`document "${id}" has no Path`);
	return { Id: id, Path: raw["Path"], Script: typeof raw["Script"] === "string" ? raw["Script"] : "" };
}

export function ParseUiManifest(text: string): UiManifest {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new ManifestError("not JSON");
	}
	const record = IsObject(raw) ? raw : {};
	if (record["Documents"] !== undefined && !Array.isArray(record["Documents"])) throw new ManifestError("Documents must be a list");
	const documents = ((record["Documents"] as unknown[] | undefined) ?? []).map(ReadEntry);
	const seen = new Set<string>();
	for (const document of documents) {
		if (seen.has(document.Id)) throw new ManifestError(`two documents are called "${document.Id}"`);
		seen.add(document.Id);
	}
	return { FileVersion: 1, Documents: documents };
}

export function SerializeUiManifest(manifest: UiManifest): string {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The manifest with this entry added, or replacing the one with the same Id (the original is not changed). */
export function UpsertManifestEntry(manifest: UiManifest, entry: UiManifestEntry): UiManifest {
	const documents = manifest.Documents.filter((d) => d.Id !== entry.Id);
	const index = manifest.Documents.findIndex((d) => d.Id === entry.Id);
	documents.splice(index < 0 ? documents.length : index, 0, { ...entry });
	return { ...manifest, Documents: documents };
}
