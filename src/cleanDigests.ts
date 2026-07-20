import { App, TFile } from "obsidian";
import SupernoteDigests from "./main";
import { FRONTMATTER_GENERATED_BY } from "./constants";

export default function cleanDigests(app: App, plugin: SupernoteDigests) {
	const { pathToAtlas, pathToDigests } = plugin.settings;

	const digests = app.vault.getFolderByPath(pathToDigests);

	const atlasFiles = app.vault.getFolderByPath(pathToAtlas);

	const digestChildren = digests?.children ?? [];

	const combinedFiles = digestChildren.concat(atlasFiles?.children ?? []);

	for (const file of combinedFiles) {
		if (!(file instanceof TFile)) continue;

		if (
			app.metadataCache.getFileCache(file)?.frontmatter?.[
				"generated_by"
			] == FRONTMATTER_GENERATED_BY
		) {
			app.vault.delete(file);
		}
	}
}
