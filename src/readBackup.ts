import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter, TFile, TFolder } from "obsidian";
import { SupernoteX, toImage } from "supernote-typescript";
import MyPlugin from "./main";
import { encodePng, Image } from "image-js";
import {
	HEAD_ATLAS_FILE,
	PATH_TO_KNOWLEDGE_FILE,
	PATH_TO_MARK_FILES,
	TEMPLATE_PATHS,
	TEMPLATE_VARIABLES,
} from "./constants";

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

function trimImageBottom(image: Image, padding = 80): Image {
	const { width, height } = image;
	let lastContentRow = 0;

	for (let y = height - 1; y >= 0; y--) {
		let rowHasContent = false;
		for (let x = 0; x < width; x++) {
			const pixel = image.getPixel(x, y);
			if (pixel[0]! < 250 || pixel[1]! < 250 || pixel[2]! < 250) {
				rowHasContent = true;
				break;
			}
		}
		if (rowHasContent) {
			lastContentRow = y;
			break;
		}
	}

	return image.crop({
		width,
		height: Math.min(lastContentRow + padding, height),
	});
}

async function createMarkImageFile(
	markName: string,
	zip: JSZip,
	imagePath: string,
	app: App,
) {
	// find mark file
	const markFile = zip.file(PATH_TO_MARK_FILES + markName);
	const markBuffer = await markFile?.async("uint8array");

	if (markBuffer) {
		const mark = new SupernoteX(markBuffer);
		const images = await toImage(mark);

		const rawImage = images[0]!;
		const pngBuffer =
			rawImage instanceof Image
				? encodePng(trimImageBottom(rawImage))
				: encodePng(rawImage);
		try {
			await app.vault.createBinary(imagePath, pngBuffer);
		} catch (error) {
			console.log(error);
		}
	}
}

function humanReadableDateTime(
	creationTime: number,
	forFilePath: boolean = false,
) {
	let readableDateTime = new Date(creationTime).toLocaleString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	if (forFilePath) {
		readableDateTime = readableDateTime.replace(/:/g, ".");
	}
	return readableDateTime;
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
	const { pathToAtlas, pathToImages, pathToDigests } = plugin.settings;

	// check if Digests folder exists folder exists
	let digestFolder = app.vault.getFolderByPath(pathToDigests);
	if (!digestFolder) {
		digestFolder = await app.vault.createFolder(pathToDigests);
	}

	// check for images folder, create if it doesn't exist
	if (!app.vault.getFolderByPath(pathToImages)) {
		await app.vault.createFolder(pathToImages);
	}

	// check for supernote_digests and create if not exists
	if (!app.vault.getFileByPath(`${pathToAtlas}/${HEAD_ATLAS_FILE}.md`)) {
		await app.vault.createFolder(pathToAtlas);

		const atlasTemplate = retrieveTemplate(
			TEMPLATE_PATHS.atlas,
			plugin,
			app,
		);

		await app.vault.create(
			`${pathToAtlas}/${HEAD_ATLAS_FILE}.md`,
			atlasTemplate
				.replace(TEMPLATE_VARIABLES.atlasTitle, HEAD_ATLAS_FILE)
				.replace("up :: [[{{head}}]]", ""),
		);
	}

	//read the backup file
	const backupBuffer = fs.readFileSync(pathToBackup);
	const zip = await JSZip.loadAsync(backupBuffer);

	const knowledgeFile: KnowledgeEntry[] = JSON.parse(
		(await zip.file(PATH_TO_KNOWLEDGE_FILE)?.async("string")) ?? "[]",
	);

	const documents: Record<string, TFile | null> = {};

	//iterate through the knowledge.json file to find mark files
	for (const knowledge of knowledgeFile) {
		// generate unique id for each mark and then check if it already exists in our vault
		const sourceId = knowledge.creationTime;
		const dateBasedFileName = humanReadableDateTime(sourceId, true);

		//get doc for document style notes
		const docName =
			knowledge.sourcePath.split("/").at(-1)?.split(".")[0] ??
			knowledge.sourcePage;
		//get docFile path based on atomic vs document style notes
		let docFilePath = `${pathToDigests}/${docName}.md`;

		if (plugin.settings.noteOrgStyle == "atomic") {
			docFilePath = `${pathToAtlas}/${docName}.md`;
		}

		documents[docName] = app.vault.getFileByPath(docFilePath);

		// check if note has already been created
		let noteExists = false;
		if (plugin.settings.noteOrgStyle == "atomic") {
			noteExists = atomicNoteExists(digestFolder, app, dateBasedFileName);
		}

		if (plugin.settings.noteOrgStyle == "document") {
			noteExists = await documentNoteExists(
				documents[docName],
				app,
				dateBasedFileName,
			);
		}

		// note exists so skip note creation and mark file extraction
		if (noteExists) continue;

		// Create Mark Image
		const imagePath = `${pathToImages}/${sourceId}.png`;
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
			TEMPLATE_PATHS.atomic,
			plugin,
			app,
		);

		if (plugin.settings.noteOrgStyle == "atomic") {
			// check for atlas document
			// if it doesn't exist than create it and add the MOC template
			if (!documents[docName]) {
				const documentMocTemplate = retrieveTemplate(
					TEMPLATE_PATHS.atlas,
					plugin,
					app,
				);

				documents[docName] = await app.vault.create(
					docFilePath,
					documentMocTemplate
						.replace(TEMPLATE_VARIABLES.atlasHead, HEAD_ATLAS_FILE)
						.replace(TEMPLATE_VARIABLES.atlasTitle, docName),
				);
			}

			// Fill In Templates for Atomic Notes
			let filledAtomicTemplate = atomicTemplate
				.replace(
					TEMPLATE_VARIABLES.source,
					docName ?? knowledge.sourcePath,
				)
				.replace(TEMPLATE_VARIABLES.sourcePage, knowledge.sourcePage)
				.replace(
					TEMPLATE_VARIABLES.createdOn,
					humanReadableDateTime(knowledge.creationTime),
				)
				.replace(TEMPLATE_VARIABLES.sourceId, sourceId.toString())
				.replace(TEMPLATE_VARIABLES.highlight, knowledge.content)
				.replace(TEMPLATE_VARIABLES.imagePath, imagePath);

			const notePath = `${pathToDigests}/${dateBasedFileName}.md`;
			try {
				await app.vault.create(notePath, filledAtomicTemplate);
			} catch (err) {
				console.error(err);
			}
		}

		// Get Template Header
		const templateDocumentHeader = retrieveTemplate(
			TEMPLATE_PATHS.docHead,
			plugin,
			app,
		);
		// Get Template Body
		const templateBody = retrieveTemplate(
			TEMPLATE_PATHS.docBody,
			plugin,
			app,
		);

		if (plugin.settings.noteOrgStyle == "document") {
			//check if the header exists
			if (!documents[docName]) {
				const filledTemplateHeader = templateDocumentHeader.replace(
					TEMPLATE_VARIABLES.source,
					docName ?? knowledge.sourcePath,
				);

				documents[docName] = await app.vault.create(
					docFilePath,
					filledTemplateHeader,
				);
			}

			//read docFile
			await app.vault.process(documents[docName], (content) => {
				return (
					content +
					"\n\n" +
					templateBody
						.replace(
							TEMPLATE_VARIABLES.highlight,
							knowledge.content,
						)
						.replace(TEMPLATE_VARIABLES.imagePath, imagePath)
						.replace(
							TEMPLATE_VARIABLES.sourceId,
							sourceId.toString(),
						)
						.replace(
							TEMPLATE_VARIABLES.sourcePage,
							knowledge.sourcePage,
						)
						.replace(
							TEMPLATE_VARIABLES.createdOn,
							humanReadableDateTime(knowledge.creationTime),
						)
				);
			});
		}
	}

	return path;
}
