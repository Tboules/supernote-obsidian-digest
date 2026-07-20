import { unzipSync } from "fflate";
import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter, TFile, TFolder } from "obsidian";
import { SupernoteX, toImage } from "supernote-typescript";
import SupernoteDigests from "./main";
import { encodePng, Image } from "image-js";
import {
	HEAD_ATLAS_FILE,
	PATH_TO_KNOWLEDGE_FILE,
	PATH_TO_MARK_FILES,
	TEMPLATE_PATHS,
	TEMPLATE_VARIABLES,
} from "./constants";

interface AtomicNoteFrontMatter {
	next_note?: string;
	previous_note?: string;
}

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
	markBuffer: Uint8Array<ArrayBuffer>,
	imagePath: string,
	app: App,
) {
	// find mark file

	const mark = new SupernoteX(markBuffer);
	const images = await toImage(mark);

	const rawImage = images[0];
	if (rawImage) {
		const pngBuffer =
			rawImage instanceof Image
				? encodePng(trimImageBottom(rawImage))
				: encodePng(rawImage);
		try {
			await app.vault.createBinary(imagePath, pngBuffer);
		} catch (error) {
			console.error(error);
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
	plugin: SupernoteDigests,
	app: App,
): string {
	const relativeTemplatePath = path.join(
		(app.vault.adapter as FileSystemAdapter).getBasePath(),
		plugin.manifest.dir ?? "",
		templatePath,
	);
	return fs.readFileSync(relativeTemplatePath, "utf-8");
}

function extractDocName(document: KnowledgeEntry): string {
	return (
		document.sourcePath.split("/").at(-1)?.split(".")[0] ??
		document.sourcePage
	);
}

function documentsMatch(
	current: KnowledgeEntry,
	previous?: KnowledgeEntry,
): previous is KnowledgeEntry {
	if (!previous) return false;

	return current.sourcePath.localeCompare(previous.sourcePath) == 0;
}

export default async function extractDigestsFromBackup(
	pathToBackup: string,
	app: App,
	plugin: SupernoteDigests,
	incrementProgressBar: (value: number) => void,
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
		// if atlas folder doesn't exist, create it
		if (!app.vault.getFolderByPath(pathToAtlas)) {
			await app.vault.createFolder(pathToAtlas);
		}

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

	const knowledgeZip = unzipSync(backupBuffer, {
		filter: (f) => f.name === PATH_TO_KNOWLEDGE_FILE,
	});
	const knowledgeBytes = knowledgeZip[PATH_TO_KNOWLEDGE_FILE];
	const knowledgeJson = knowledgeBytes
		? new TextDecoder().decode(knowledgeBytes)
		: "[]";

	const parsedKnowledge: unknown = JSON.parse(knowledgeJson);
	if (!Array.isArray(parsedKnowledge)) {
		throw new Error(
			"Malformed knowledge.json in backup file — expected an array of digest entries.",
		);
	}
	let knowledgeFile = parsedKnowledge as KnowledgeEntry[];

	knowledgeFile.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

	// List of Documents for Atlas
	const documents: Record<string, TFile | null> = {};

	//iterate through the knowledge.json file to find mark files
	for (const [index, knowledge] of knowledgeFile.entries()) {
		// generate unique id for each mark and then check if it already exists in our vault
		const sourceId = knowledge.creationTime;
		const dateBasedFileName = humanReadableDateTime(sourceId, true);

		//get doc for document style notes
		const docName = extractDocName(knowledge);
		//get docFile path based on atomic vs document style notes
		let docFilePath = `${pathToDigests}/${docName}.md`;

		if (plugin.settings.noteOrgStyle == "atomic") {
			docFilePath = `${pathToAtlas}/${docName}.md`;
		}

		let atomicNotePath = `${pathToDigests}/${dateBasedFileName}.md`;

		documents[docName] = app.vault.getFileByPath(docFilePath);

		// check if note has already been created
		let noteExists = false;
		if (plugin.settings.noteOrgStyle == "atomic") {
			noteExists = atomicNoteExists(
				digestFolder,
				app,
				sourceId.toString(),
			);
		}

		if (plugin.settings.noteOrgStyle == "document") {
			noteExists = await documentNoteExists(
				documents[docName],
				app,
				sourceId.toString(),
			);
		}

		// progress bar logic
		const progress = (100 / knowledgeFile.length) * (index + 1);
		incrementProgressBar(progress);

		// next and pervious logic
		const previousKnowledgeEntry = knowledgeFile[index - 1];
		const nextKowledgeEntry = knowledgeFile[index + 1];
		const atomicTemplate = retrieveTemplate(
			TEMPLATE_PATHS.atomic,
			plugin,
			app,
		);
		let filledAtomicTemplate = atomicTemplate;
		// check if documents match
		if (documentsMatch(knowledge, previousKnowledgeEntry)) {
			// check if previous note exists
			if (noteExists) {
				const file = app.vault.getFileByPath(atomicNotePath);
				if (file) {
					await app.fileManager.processFrontMatter(
						file,
						(fm: AtomicNoteFrontMatter) => {
							fm.previous_note = `[[${humanReadableDateTime(previousKnowledgeEntry.creationTime, true)}]]`;
						},
					);
				}
			} else {
				filledAtomicTemplate = filledAtomicTemplate.replace(
					TEMPLATE_VARIABLES.previousNote,
					humanReadableDateTime(
						previousKnowledgeEntry.creationTime,
						true,
					),
				);
			}
		} else {
			filledAtomicTemplate = filledAtomicTemplate.replace(
				`previous_note: "[[${TEMPLATE_VARIABLES.previousNote}]]"\n`,
				"",
			);
		}

		if (documentsMatch(knowledge, nextKowledgeEntry)) {
			// if a next entry has become available since this note was created,
			// patch its frontmatter directly instead of recreating the whole note
			if (noteExists) {
				const file = app.vault.getFileByPath(atomicNotePath);
				if (file) {
					await app.fileManager.processFrontMatter(
						file,
						(fm: AtomicNoteFrontMatter) => {
							fm.next_note = `[[${humanReadableDateTime(nextKowledgeEntry.creationTime, true)}]]`;
						},
					);
				}
			} else {
				filledAtomicTemplate = filledAtomicTemplate.replace(
					TEMPLATE_VARIABLES.nextNote,
					humanReadableDateTime(nextKowledgeEntry.creationTime, true),
				);
			}
		} else {
			filledAtomicTemplate = filledAtomicTemplate.replace(
				`next_note: "[[${TEMPLATE_VARIABLES.nextNote}]]"\n`,
				"",
			);
		}
		// note exists so skip note creation and mark file extraction
		if (noteExists) continue;

		// Create Mark Image
		const imagePath = `${pathToImages}/${sourceId}.png`;
		const imageExists = app.vault.getFileByPath(imagePath);
		if (!imageExists) {
			const markPath = `${PATH_TO_MARK_FILES}${knowledge.commentHandwriteName}`;
			const markZip = unzipSync(backupBuffer, {
				filter: (f) => f.name === markPath,
			});
			const markBuffer = markZip[markPath];
			if (markBuffer) {
				await createMarkImageFile(markBuffer, imagePath, app);
			}
		}

		//grab atomic template so it can be filled

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
			filledAtomicTemplate = filledAtomicTemplate
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

			try {
				await app.vault.create(atomicNotePath, filledAtomicTemplate);
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

	incrementProgressBar(0);
}
