import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter, TFile, TFolder } from "obsidian";
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

function atomicNoteExists(
	digestFolder: TFolder,
	app: App,
	noteUniqueId: string,
): boolean {
	return digestFolder.children.some((f) => {
		if (!(f instanceof TFile)) return false;

		const cache = app.metadataCache.getFileCache(f);
		return cache?.frontmatter?.["source_id"] == noteUniqueId;
	});
}

async function documentNoteExists(
	doc: TFile | null,
	app: App,
	noteUniqueId: string,
) {
	if (!doc) return false;
	return (await app.vault.read(doc)).includes(noteUniqueId);
}

async function createMarkImageFile(
	markName: string,
	zip: JSZip,
	imagePath: string,
	app: App,
) {
	// find mark file
	const markPath = "backup/DIGEST/handwrite/";
	const markFile = zip.file(markPath + markName);
	// Understand, what is a buffer? what is a uint8array
	const markBuffer = await markFile?.async("uint8array");

	//to-do convert markfile to PNG in order to include it in note
	if (markBuffer) {
		const mark = new SupernoteX(markBuffer);
		const images = await toImage(mark);

		const pngBuffer = encodePng(images[0]!);
		try {
			await app.vault.createBinary(imagePath, pngBuffer);
		} catch (error) {
			console.log(error);
		}
	}
}

function humanReadableDateTime(creationTime: number) {
	return new Date(creationTime).toLocaleString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function retrieveTemplate(
	templatePath: string,
	plugin: MyPlugin,
	app: App,
): string {
	const relativeTemplatePath = path.join(
		(app.vault.adapter as FileSystemAdapter).getBasePath(),
		plugin.manifest.dir ?? "",
		templatePath,
	);
	return fs.readFileSync(relativeTemplatePath, "utf-8");
}

export default async function extractDigestsFromBackup(
	pathToBackup: string,
	app: App,
	plugin: MyPlugin,
) {
	const defaultFolderPath = plugin.settings.pathToDigests;
	const defaultImagesPath = plugin.settings.pathToImages;
	const atlasFolderPath = plugin.settings.pathToAtlas;

	// check if Digests folder exists folder exists
	let digestFolder = app.vault.getFolderByPath(defaultFolderPath);
	if (!digestFolder) {
		digestFolder = await app.vault.createFolder(defaultFolderPath);
	}

	// check for images folder, create if it doesn't exist
	if (!app.vault.getFolderByPath(defaultImagesPath)) {
		await app.vault.createFolder(defaultImagesPath);
	}

	// check for supernote_digests and create if not exists
	if (!app.vault.getFileByPath(`${atlasFolderPath}/supernote_digests.md`)) {
		await app.vault.createFolder(atlasFolderPath);

		const atlasTemplate = retrieveTemplate(
			"template/atlas_template.md",
			plugin,
			app,
		);

		await app.vault.create(
			`${atlasFolderPath}/supernote_digests.md`,
			atlasTemplate
				.replace(/{{title}}/g, "supernote_digests")
				.replace("up :: {{head}}", ""),
		);
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

		//get doc for document style notes
		const docName = knowledge.sourcePath.split("/").at(-1)?.split(".")[0];
		const docFilePath = `${defaultFolderPath}/${docName}.md`;
		let docFile = app.vault.getFileByPath(docFilePath);

		// check if note has already been created
		let noteExists = false;
		if (plugin.settings.noteOrgStyle == "atomic") {
			noteExists = atomicNoteExists(digestFolder, app, noteUniqueId);
		}

		if (plugin.settings.noteOrgStyle == "document") {
			noteExists = await documentNoteExists(docFile, app, noteUniqueId);
		}

		// note exists so skip note creation and mark file extraction
		if (noteExists) continue;

		// Create Mark Image
		const imagePath = `${defaultImagesPath}/${noteUniqueId}.png`;
		const imageExists = app.vault.getFileByPath(imagePath);
		if (!imageExists) {
			await createMarkImageFile(
				knowledge.commentHandwriteName,
				zip,
				imagePath,
				app,
			);
		}

		//grab atomic template so it can be filled
		const atomicTemplate = retrieveTemplate(
			"template/atomic_template.md",
			plugin,
			app,
		);

		if (plugin.settings.noteOrgStyle == "atomic") {
			// Fill In Templates for Atomic Notes
			const filledAtomicTemplate = atomicTemplate
				.replace(/<SOURCE>/g, docName ?? knowledge.sourcePath)
				.replace("<SOURCE_PAGE>", knowledge.sourcePage)
				.replace(
					"<CREATED_ON>",
					humanReadableDateTime(knowledge.creationTime),
				)
				.replace("<SOURCE_ID>", noteUniqueId)
				.replace("<HIGHLIGHT>", knowledge.content)
				.replace("IMAGE_PATH", imagePath);

			//to-do Check template type, Atomic Notes vs Document Notes
			const notePath =
				defaultFolderPath +
				"/" +
				knowledge.commentHandwriteName.replace(
					".mark",
					Date.now() + ".md",
				);

			try {
				await app.vault.create(notePath, filledAtomicTemplate);
			} catch (err) {
				console.error(err);
			}
		}

		// Get Template Header
		const templateDocumentHeader = retrieveTemplate(
			"template/document_header.md",
			plugin,
			app,
		);
		// Get Template Body
		const templateBody = retrieveTemplate(
			"template/digest.md",
			plugin,
			app,
		);

		if (plugin.settings.noteOrgStyle == "document") {
			//check if the header exists
			if (!docFile) {
				const filledTemplateHeader = templateDocumentHeader.replace(
					/<SOURCE>/g,
					docName ?? knowledge.sourcePath,
				);

				docFile = await app.vault.create(
					docFilePath,
					filledTemplateHeader,
				);
			}

			//read docFile
			await app.vault.process(docFile, (content) => {
				return (
					content +
					"\n\n" +
					templateBody
						.replace("<HIGHLIGHT>", knowledge.content)
						.replace("IMAGE_PATH", imagePath)
						.replace("<SOURCE_ID>", noteUniqueId)
						.replace("<SOURCE_PAGE>", knowledge.sourcePage)
						.replace(
							"<CREATED_ON>",
							humanReadableDateTime(knowledge.creationTime),
						)
				);
			});
		}
	}

	return path;
}
