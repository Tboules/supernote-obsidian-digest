import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter, TFile } from "obsidian";
import { SupernoteX, toImage } from "supernote-typescript";
import MyPlugin from "./main";
import { encodePng } from "image-js";

type KnowledgeEntry = {
	commentHandwriteName: string;
	commentStr: string;
	content: string;
	creationTime: number;
	dataMD5: string;
	handwriteMD5: string;
	id: number;
	knowledgeBaseUniqueAttribute: string;
	lastModifiedTime: number;
	metadata: string;
	pendingSync: boolean;
	serviceId: number;
	sourcePage: string;
	sourcePath: string;
	sourceType: number;
	state: number;
	syncLock: boolean;
	syncState: number;
};

export default async function readBackup(
	pathToBackup: string,
	app: App,
	plugin: MyPlugin,
) {
	console.log("generate func");
	const defaultFolderPath = "SN/Digests";
	const defaultImagesPath = "SN/Images";

	// check if Digests folder exists folder exists
	let digestFolder = app.vault.getFolderByPath(defaultFolderPath);
	if (!digestFolder) {
		digestFolder = await app.vault.createFolder(defaultFolderPath);
	}

	if (!app.vault.getFolderByPath(defaultImagesPath)) {
		await app.vault.createFolder(defaultImagesPath);
	}

	//read the backup file
	const backupBuffer = fs.readFileSync(pathToBackup);
	const zip = await JSZip.loadAsync(backupBuffer);

	const knowledgeFile: KnowledgeEntry[] = JSON.parse(
		(await zip.file("backup/DIGEST/knowledge.json")?.async("string")) ??
			"[]",
	);

	//iterate through the knowledge.json file to find mark files
	for (const knowledge of knowledgeFile) {
		// generate unique id for each mark and then check if it already exists in our vault
		const noteUniqueId = `${knowledge.dataMD5}-${knowledge.creationTime}`;

		// check if file already exists
		const noteExists = digestFolder.children.some((f) => {
			if (!(f instanceof TFile)) return false;

			const cache = app.metadataCache.getFileCache(f);
			return cache?.frontmatter?.["source_id"] == noteUniqueId;
		});

		if (noteExists) continue;

		// find mark file
		const markPath = "backup/DIGEST/handwrite/";
		const markFile = zip.file(markPath + knowledge.commentHandwriteName);
		// Understand, what is a buffer? what is a uint8array
		const markBuffer = await markFile?.async("uint8array");

		//to-do convert markfile to PNG in order to include it in note
		if (markBuffer) {
			const mark = new SupernoteX(markBuffer);
			const images = await toImage(mark);

			const pngBuffer = encodePng(images[0]!);
			try {
				await app.vault.createBinary(
					defaultImagesPath + `/${noteUniqueId}.png`,
					pngBuffer,
				);
			} catch (error) {
				console.log(error);
			}
		}

		// Get Template
		const templatePath = path.join(
			(app.vault.adapter as FileSystemAdapter).getBasePath(),
			plugin.manifest.dir ?? "",
			"template/digest.md",
		);
		const template = fs.readFileSync(templatePath, "utf-8");

		// Fill In Template
		const dataFilledTemplate = template
			.replace(/<SOURCE>/g, knowledge.sourcePath)
			.replace("<SOURCE_PAGE>", knowledge.sourcePage)
			.replace(
				"<CREATED_ON>",
				new Date(knowledge.creationTime).toISOString(),
			)
			.replace("<HIGHLIGHT>", knowledge.content)
			.replace("<SOURCE_ID>", noteUniqueId);

		//to-do Check template type, Atomic Notes vs Document Notes
		const notePath =
			defaultFolderPath +
			"/" +
			knowledge.commentHandwriteName.replace(".mark", Date.now() + ".md");

		try {
			await app.vault.create(notePath, dataFilledTemplate);
		} catch (err) {
			console.log(err);
		}
	}

	return path;
}
