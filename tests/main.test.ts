import { describe, expect, it, vi } from "vitest";
import cleanDigest from "../src/cleanDigests.ts";
import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import MyPlugin from "../src/main.ts";

vi.mock("obsidian");

describe("cleanDigests", () => {
	it("deletes all files from folder with appropriate frontmatter", () => {
		const atlasFolder = new TFolder();
		const digestFolder = new TFolder();
		//arrange
		const app = {
			metadataCache: {
				getFileCache: (file: TFile): CachedMetadata | null => {
					return {
						//@ts-ignore
						frontmatter: file.frontmatter,
					};
				},
			},
			vault: {
				delete: vi.fn((file: TFile): void => {}),
				getFolderByPath: (path: string): TFolder => {
					const atlasFiles = [
						{ test: "test" },
						{ generated_by: "supernote-obsidian-digest" },
						{ foo: "bar" },
					];

					const digestFiles = [
						{ generated_by: "supernote-obsidian-digest" },
						{ bar: "foo" },
						{ generated_by: "supernote-obsidian-digest" },
						{ generated_by: "supernote-obsidian-digest" },
						{ generated_by: "supernote-obsidian-digest" },
					];

					if (path == "atlas") {
						atlasFolder.children = atlasFiles.map((f) => {
							let updatedFile = new TFile();

							//@ts-ignore
							updatedFile.frontmatter = f;

							return updatedFile;
						});
					}

					if (path == "digests") {
						digestFolder.children = digestFiles.map((f) => {
							let updatedFile = new TFile();

							//@ts-ignore
							updatedFile.frontmatter = f;

							return updatedFile;
						});
					}

					return path == "digests" ? digestFolder : atlasFolder;
				},
			},
		} as unknown as App;

		const plugin = {
			settings: {
				pathToDigests: "digests",
				pathToAtlas: "atlas",
			},
		} as unknown as MyPlugin;

		//act
		cleanDigest(app, plugin);

		//assert
		expect(app.vault.delete).toHaveBeenCalledTimes(5);
		expect(app.vault.delete).not.toHaveBeenCalledWith(
			atlasFolder.children[0],
		);
		expect(app.vault.delete).not.toHaveBeenCalledWith(
			atlasFolder.children[2],
		);
		expect(app.vault.delete).not.toHaveBeenCalledWith(
			digestFolder.children[1],
		);
	});
});
