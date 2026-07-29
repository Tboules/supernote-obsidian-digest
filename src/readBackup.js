import { __awaiter } from "tslib";
import { unzipSync } from "fflate";
import * as fs from "fs";
import { TFile } from "obsidian";
import { SupernoteX, toImage } from "supernote-typescript";
import { encodePng, Image } from "image-js";
import { HEAD_ATLAS_FILE, TEMPLATE_VARIABLES, } from "./constants";
import atlasTemplate from "../template/atlas_template.md";
import atomicTemplate from "../template/atomic_template.md";
import documentHeaderTemplate from "../template/document_header.md";
import digestBodyTemplate from "../template/digest.md";
function atomicNoteExists(digestFolder, app, noteUniqueId) {
    return digestFolder.children.some((f) => {
        var _a;
        if (!(f instanceof TFile))
            return false;
        const cache = app.metadataCache.getFileCache(f);
        return ((_a = cache === null || cache === void 0 ? void 0 : cache.frontmatter) === null || _a === void 0 ? void 0 : _a["source_id"]) == noteUniqueId;
    });
}
function documentNoteExists(doc, app, noteUniqueId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!doc)
            return false;
        return (yield app.vault.read(doc)).includes(noteUniqueId);
    });
}
function trimImageBottom(image, padding = 80) {
    const { width, height } = image;
    let lastContentRow = 0;
    for (let y = height - 1; y >= 0; y--) {
        let rowHasContent = false;
        for (let x = 0; x < width; x++) {
            const pixel = image.getPixel(x, y);
            if (pixel[0] < 250 || pixel[1] < 250 || pixel[2] < 250) {
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
function createMarkImageFile(markBuffer, imagePath, app) {
    return __awaiter(this, void 0, void 0, function* () {
        // find mark file
        const mark = new SupernoteX(markBuffer);
        const images = yield toImage(mark);
        const rawImage = images[0];
        if (rawImage) {
            const pngBuffer = rawImage instanceof Image
                ? encodePng(trimImageBottom(rawImage))
                : encodePng(rawImage);
            try {
                yield app.vault.createBinary(imagePath, pngBuffer);
            }
            catch (error) {
                console.error(error);
            }
        }
    });
}
function humanReadableDateTime(creationTime, forFilePath = false) {
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
function extractDocName(document) {
    var _a, _b;
    return ((_b = (_a = document.sourcePath.split("/").at(-1)) === null || _a === void 0 ? void 0 : _a.split(".")[0]) !== null && _b !== void 0 ? _b : document.sourcePage);
}
function documentsMatch(current, previous) {
    if (!previous)
        return false;
    return current.sourcePath.localeCompare(previous.sourcePath) == 0;
}
export default function extractDigestsFromBackup(pathToBackup, app, plugin, incrementProgressBar) {
    return __awaiter(this, void 0, void 0, function* () {
        const { pathToAtlas, pathToImages, pathToDigests } = plugin.settings;
        // check if Digests folder exists folder exists
        let digestFolder = app.vault.getFolderByPath(pathToDigests);
        if (!digestFolder) {
            digestFolder = yield app.vault.createFolder(pathToDigests);
        }
        // check for images folder, create if it doesn't exist
        if (!app.vault.getFolderByPath(pathToImages)) {
            yield app.vault.createFolder(pathToImages);
        }
        // check for supernote_digests and create if not exists
        if (!app.vault.getFileByPath(`${pathToAtlas}/${HEAD_ATLAS_FILE}.md`)) {
            // if atlas folder doesn't exist, create it
            if (!app.vault.getFolderByPath(pathToAtlas)) {
                yield app.vault.createFolder(pathToAtlas);
            }
            yield app.vault.create(`${pathToAtlas}/${HEAD_ATLAS_FILE}.md`, atlasTemplate
                .replace(TEMPLATE_VARIABLES.atlasTitle, HEAD_ATLAS_FILE)
                .replace("up :: [[{{head}}]]", ""));
        }
        //read the backup file
        const backupBuffer = fs.readFileSync(pathToBackup);
        const knowledgeZip = unzipSync(backupBuffer, {
            filter: (f) => f.name.toLowerCase().endsWith('knowledge.json')
        });
        const knowledgeFileMatches = Object.keys(knowledgeZip);
        const [knowledgeFileName, ...extraMatches] = knowledgeFileMatches;
        if (!knowledgeFileName || extraMatches.length > 0) {
            throw new Error(`Expected exactly one knowledge.json match in backup, found ${knowledgeFileMatches.length}.`);
        }
        const knowledgeBytes = knowledgeZip[knowledgeFileName];
        const knowledgeJson = knowledgeBytes
            ? new TextDecoder().decode(knowledgeBytes)
            : "[]";
        const parsedKnowledge = JSON.parse(knowledgeJson);
        if (!Array.isArray(parsedKnowledge)) {
            throw new Error("Malformed knowledge.json in backup file — expected an array of digest entries.");
        }
        let knowledgeFile = parsedKnowledge;
        knowledgeFile.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
        // List of Documents for Atlas
        const documents = {};
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
                noteExists = atomicNoteExists(digestFolder, app, sourceId.toString());
            }
            if (plugin.settings.noteOrgStyle == "document") {
                noteExists = yield documentNoteExists(documents[docName], app, sourceId.toString());
            }
            // progress bar logic
            const progress = (100 / knowledgeFile.length) * (index + 1);
            incrementProgressBar(progress);
            // next and pervious logic
            const previousKnowledgeEntry = knowledgeFile[index - 1];
            const nextKowledgeEntry = knowledgeFile[index + 1];
            let filledAtomicTemplate = atomicTemplate;
            // check if documents match
            if (documentsMatch(knowledge, previousKnowledgeEntry)) {
                // check if previous note exists
                if (noteExists) {
                    const file = app.vault.getFileByPath(atomicNotePath);
                    if (file) {
                        yield app.fileManager.processFrontMatter(file, (fm) => {
                            fm.previous_note = `[[${humanReadableDateTime(previousKnowledgeEntry.creationTime, true)}]]`;
                        });
                    }
                }
                else {
                    filledAtomicTemplate = filledAtomicTemplate.replace(TEMPLATE_VARIABLES.previousNote, humanReadableDateTime(previousKnowledgeEntry.creationTime, true));
                }
            }
            else {
                filledAtomicTemplate = filledAtomicTemplate.replace(`previous_note: "[[${TEMPLATE_VARIABLES.previousNote}]]"\n`, "");
            }
            if (documentsMatch(knowledge, nextKowledgeEntry)) {
                // if a next entry has become available since this note was created,
                // patch its frontmatter directly instead of recreating the whole note
                if (noteExists) {
                    const file = app.vault.getFileByPath(atomicNotePath);
                    if (file) {
                        yield app.fileManager.processFrontMatter(file, (fm) => {
                            fm.next_note = `[[${humanReadableDateTime(nextKowledgeEntry.creationTime, true)}]]`;
                        });
                    }
                }
                else {
                    filledAtomicTemplate = filledAtomicTemplate.replace(TEMPLATE_VARIABLES.nextNote, humanReadableDateTime(nextKowledgeEntry.creationTime, true));
                }
            }
            else {
                filledAtomicTemplate = filledAtomicTemplate.replace(`next_note: "[[${TEMPLATE_VARIABLES.nextNote}]]"\n`, "");
            }
            // note exists so skip note creation and mark file extraction
            if (noteExists)
                continue;
            // Create Mark Image
            const imagePath = `${pathToImages}/${sourceId}.png`;
            const imageExists = app.vault.getFileByPath(imagePath);
            if (!imageExists) {
                // const markPath = `${PATH_TO_MARK_FILES}${knowledge.commentHandwriteName}`;
                const markZip = unzipSync(backupBuffer, {
                    filter: (f) => f.name.endsWith(knowledge.commentHandwriteName),
                });
                const markMatches = Object.keys(markZip);
                const [markPath, ...extraMatches] = markMatches;
                if (!markPath || extraMatches.length > 0) {
                    throw new Error('Path to handwritten note not found');
                }
                const markBuffer = markZip[markPath];
                if (markBuffer) {
                    yield createMarkImageFile(markBuffer, imagePath, app);
                }
            }
            //grab atomic template so it can be filled
            if (plugin.settings.noteOrgStyle == "atomic") {
                // check for atlas document
                // if it doesn't exist than create it and add the MOC template
                if (!documents[docName]) {
                    documents[docName] = yield app.vault.create(docFilePath, atlasTemplate
                        .replace(TEMPLATE_VARIABLES.atlasHead, HEAD_ATLAS_FILE)
                        .replace(TEMPLATE_VARIABLES.atlasTitle, docName));
                }
                // Fill In Templates for Atomic Notes
                filledAtomicTemplate = filledAtomicTemplate
                    .replace(TEMPLATE_VARIABLES.source, docName !== null && docName !== void 0 ? docName : knowledge.sourcePath)
                    .replace(TEMPLATE_VARIABLES.sourcePage, knowledge.sourcePage)
                    .replace(TEMPLATE_VARIABLES.createdOn, humanReadableDateTime(knowledge.creationTime))
                    .replace(TEMPLATE_VARIABLES.sourceId, sourceId.toString())
                    .replace(TEMPLATE_VARIABLES.highlight, knowledge.content)
                    .replace(TEMPLATE_VARIABLES.imagePath, imagePath);
                try {
                    yield app.vault.create(atomicNotePath, filledAtomicTemplate);
                }
                catch (err) {
                    console.error(err);
                }
            }
            if (plugin.settings.noteOrgStyle == "document") {
                //check if the header exists
                if (!documents[docName]) {
                    const filledTemplateHeader = documentHeaderTemplate.replace(TEMPLATE_VARIABLES.source, docName !== null && docName !== void 0 ? docName : knowledge.sourcePath);
                    documents[docName] = yield app.vault.create(docFilePath, filledTemplateHeader);
                }
                //read docFile
                yield app.vault.process(documents[docName], (content) => {
                    return (content +
                        "\n\n" +
                        digestBodyTemplate
                            .replace(TEMPLATE_VARIABLES.highlight, knowledge.content)
                            .replace(TEMPLATE_VARIABLES.imagePath, imagePath)
                            .replace(TEMPLATE_VARIABLES.sourceId, sourceId.toString())
                            .replace(TEMPLATE_VARIABLES.sourcePage, knowledge.sourcePage)
                            .replace(TEMPLATE_VARIABLES.createdOn, humanReadableDateTime(knowledge.creationTime)));
                });
            }
        }
        incrementProgressBar(0);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZEJhY2t1cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWRCYWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkMsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFPLEtBQUssRUFBVyxNQUFNLFVBQVUsQ0FBQztBQUMvQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRTNELE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQzVDLE9BQU8sRUFDTixlQUFlLEVBQ2Ysa0JBQWtCLEdBQ2xCLE1BQU0sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sYUFBYSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sY0FBYyxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sc0JBQXNCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxrQkFBa0IsTUFBTSx1QkFBdUIsQ0FBQztBQTRCdkQsU0FBUyxnQkFBZ0IsQ0FDeEIsWUFBcUIsRUFDckIsR0FBUSxFQUNSLFlBQW9CO0lBRXBCLE9BQU8sWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs7UUFDdkMsSUFBSSxDQUFDLENBQUMsQ0FBQyxZQUFZLEtBQUssQ0FBQztZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRXhDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELE9BQU8sQ0FBQSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxXQUFXLDBDQUFHLFdBQVcsQ0FBQyxLQUFJLFlBQVksQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFlLGtCQUFrQixDQUNoQyxHQUFpQixFQUNqQixHQUFRLEVBQ1IsWUFBb0I7O1FBRXBCLElBQUksQ0FBQyxHQUFHO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDdkIsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDM0QsQ0FBQztDQUFBO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLE9BQU8sR0FBRyxFQUFFO0lBQ2xELE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO0lBQ2hDLElBQUksY0FBYyxHQUFHLENBQUMsQ0FBQztJQUV2QixLQUFLLElBQUksQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3RDLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztRQUMxQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFFLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUUsR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBRSxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUMzRCxhQUFhLEdBQUcsSUFBSSxDQUFDO2dCQUNyQixNQUFNO1lBQ1AsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLGNBQWMsR0FBRyxDQUFDLENBQUM7WUFDbkIsTUFBTTtRQUNQLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pCLEtBQUs7UUFDTCxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEdBQUcsT0FBTyxFQUFFLE1BQU0sQ0FBQztLQUNsRCxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBZSxtQkFBbUIsQ0FDakMsVUFBbUMsRUFDbkMsU0FBaUIsRUFDakIsR0FBUTs7UUFFUixpQkFBaUI7UUFFakIsTUFBTSxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxNQUFNLFNBQVMsR0FDZCxRQUFRLFlBQVksS0FBSztnQkFDeEIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3RDLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDO2dCQUNKLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3BELENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUFBO0FBRUQsU0FBUyxxQkFBcUIsQ0FDN0IsWUFBb0IsRUFDcEIsY0FBdUIsS0FBSztJQUU1QixJQUFJLGdCQUFnQixHQUFHLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUU7UUFDckUsSUFBSSxFQUFFLFNBQVM7UUFDZixLQUFLLEVBQUUsTUFBTTtRQUNiLEdBQUcsRUFBRSxTQUFTO1FBQ2QsSUFBSSxFQUFFLFNBQVM7UUFDZixNQUFNLEVBQUUsU0FBUztRQUNqQixNQUFNLEVBQUUsU0FBUztLQUNqQixDQUFDLENBQUM7SUFFSCxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUNELE9BQU8sZ0JBQWdCLENBQUM7QUFDekIsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLFFBQXdCOztJQUMvQyxPQUFPLENBQ04sTUFBQSxNQUFBLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQywwQ0FBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxtQ0FDcEQsUUFBUSxDQUFDLFVBQVUsQ0FDbkIsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FDdEIsT0FBdUIsRUFDdkIsUUFBeUI7SUFFekIsSUFBSSxDQUFDLFFBQVE7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUU1QixPQUFPLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbkUsQ0FBQztBQUVELE1BQU0sQ0FBQyxPQUFPLFVBQWdCLHdCQUF3QixDQUNyRCxZQUFvQixFQUNwQixHQUFRLEVBQ1IsTUFBd0IsRUFDeEIsb0JBQTZDOztRQUU3QyxNQUFNLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBRXJFLCtDQUErQztRQUMvQyxJQUFJLFlBQVksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsWUFBWSxHQUFHLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELHNEQUFzRDtRQUN0RCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUM5QyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCx1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEdBQUcsV0FBVyxJQUFJLGVBQWUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0RSwyQ0FBMkM7WUFDM0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7Z0JBQzdDLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUVELE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQ3JCLEdBQUcsV0FBVyxJQUFJLGVBQWUsS0FBSyxFQUN0QyxhQUFhO2lCQUNYLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDO2lCQUN2RCxPQUFPLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLENBQ25DLENBQUM7UUFDSCxDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFbkQsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLFlBQVksRUFBRTtZQUM1QyxNQUFNLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO1NBQzlELENBQUMsQ0FBQztRQUVILE1BQU0sb0JBQW9CLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQTtRQUN0RCxNQUFNLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxZQUFZLENBQUMsR0FBRyxvQkFBb0IsQ0FBQztRQUNsRSxJQUFJLENBQUMsaUJBQWlCLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuRCxNQUFNLElBQUksS0FBSyxDQUNkLDhEQUE4RCxvQkFBb0IsQ0FBQyxNQUFNLEdBQUcsQ0FDNUYsQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN2RCxNQUFNLGFBQWEsR0FBRyxjQUFjO1lBQ25DLENBQUMsQ0FBQyxJQUFJLFdBQVcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUM7WUFDMUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUVSLE1BQU0sZUFBZSxHQUFZLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxNQUFNLElBQUksS0FBSyxDQUNkLGdGQUFnRixDQUNoRixDQUFDO1FBQ0gsQ0FBQztRQUNELElBQUksYUFBYSxHQUFHLGVBQW1DLENBQUM7UUFFeEQsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRXZFLDhCQUE4QjtRQUM5QixNQUFNLFNBQVMsR0FBaUMsRUFBRSxDQUFDO1FBRW5ELDREQUE0RDtRQUM1RCxLQUFLLE1BQU0sQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLElBQUksYUFBYSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDMUQsb0ZBQW9GO1lBQ3BGLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxZQUFZLENBQUM7WUFDeEMsTUFBTSxpQkFBaUIsR0FBRyxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0NBQWtDO1lBQ2xDLE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMxQywwREFBMEQ7WUFDMUQsSUFBSSxXQUFXLEdBQUcsR0FBRyxhQUFhLElBQUksT0FBTyxLQUFLLENBQUM7WUFFbkQsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDOUMsV0FBVyxHQUFHLEdBQUcsV0FBVyxJQUFJLE9BQU8sS0FBSyxDQUFDO1lBQzlDLENBQUM7WUFFRCxJQUFJLGNBQWMsR0FBRyxHQUFHLGFBQWEsSUFBSSxpQkFBaUIsS0FBSyxDQUFDO1lBRWhFLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUUxRCx5Q0FBeUM7WUFDekMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQzlDLFVBQVUsR0FBRyxnQkFBZ0IsQ0FDNUIsWUFBWSxFQUNaLEdBQUcsRUFDSCxRQUFRLENBQUMsUUFBUSxFQUFFLENBQ25CLENBQUM7WUFDSCxDQUFDO1lBRUQsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDaEQsVUFBVSxHQUFHLE1BQU0sa0JBQWtCLENBQ3BDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFDbEIsR0FBRyxFQUNILFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FDbkIsQ0FBQztZQUNILENBQUM7WUFFRCxxQkFBcUI7WUFDckIsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzVELG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRS9CLDBCQUEwQjtZQUMxQixNQUFNLHNCQUFzQixHQUFHLGFBQWEsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ25ELElBQUksb0JBQW9CLEdBQUcsY0FBYyxDQUFDO1lBQzFDLDJCQUEyQjtZQUMzQixJQUFJLGNBQWMsQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxnQ0FBZ0M7Z0JBQ2hDLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDO29CQUNyRCxJQUFJLElBQUksRUFBRSxDQUFDO3dCQUNWLE1BQU0sR0FBRyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FDdkMsSUFBSSxFQUNKLENBQUMsRUFBeUIsRUFBRSxFQUFFOzRCQUM3QixFQUFFLENBQUMsYUFBYSxHQUFHLEtBQUsscUJBQXFCLENBQUMsc0JBQXNCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7d0JBQzlGLENBQUMsQ0FDRCxDQUFDO29CQUNILENBQUM7Z0JBQ0YsQ0FBQztxQkFBTSxDQUFDO29CQUNQLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDLE9BQU8sQ0FDbEQsa0JBQWtCLENBQUMsWUFBWSxFQUMvQixxQkFBcUIsQ0FDcEIsc0JBQXNCLENBQUMsWUFBWSxFQUNuQyxJQUFJLENBQ0osQ0FDRCxDQUFDO2dCQUNILENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsT0FBTyxDQUNsRCxxQkFBcUIsa0JBQWtCLENBQUMsWUFBWSxPQUFPLEVBQzNELEVBQUUsQ0FDRixDQUFDO1lBQ0gsQ0FBQztZQUVELElBQUksY0FBYyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xELG9FQUFvRTtnQkFDcEUsc0VBQXNFO2dCQUN0RSxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNoQixNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztvQkFDckQsSUFBSSxJQUFJLEVBQUUsQ0FBQzt3QkFDVixNQUFNLEdBQUcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQ3ZDLElBQUksRUFDSixDQUFDLEVBQXlCLEVBQUUsRUFBRTs0QkFDN0IsRUFBRSxDQUFDLFNBQVMsR0FBRyxLQUFLLHFCQUFxQixDQUFDLGlCQUFpQixDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDO3dCQUNyRixDQUFDLENBQ0QsQ0FBQztvQkFDSCxDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQ2xELGtCQUFrQixDQUFDLFFBQVEsRUFDM0IscUJBQXFCLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUMzRCxDQUFDO2dCQUNILENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsT0FBTyxDQUNsRCxpQkFBaUIsa0JBQWtCLENBQUMsUUFBUSxPQUFPLEVBQ25ELEVBQUUsQ0FDRixDQUFDO1lBQ0gsQ0FBQztZQUNELDZEQUE2RDtZQUM3RCxJQUFJLFVBQVU7Z0JBQUUsU0FBUztZQUV6QixvQkFBb0I7WUFDcEIsTUFBTSxTQUFTLEdBQUcsR0FBRyxZQUFZLElBQUksUUFBUSxNQUFNLENBQUM7WUFDcEQsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNsQiw2RUFBNkU7Z0JBQzdFLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxZQUFZLEVBQUU7b0JBQ3ZDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDO2lCQUM5RCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDeEMsTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLFlBQVksQ0FBQyxHQUFHLFdBQVcsQ0FBQTtnQkFDL0MsSUFBSSxDQUFDLFFBQVEsSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUMxQyxNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUE7Z0JBQ3RELENBQUM7Z0JBQ0QsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNyQyxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNoQixNQUFNLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3ZELENBQUM7WUFDRixDQUFDO1lBRUQsMENBQTBDO1lBRTFDLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQzlDLDJCQUEyQjtnQkFDM0IsOERBQThEO2dCQUM5RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ3pCLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUMxQyxXQUFXLEVBQ1gsYUFBYTt5QkFDWCxPQUFPLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLGVBQWUsQ0FBQzt5QkFDdEQsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FDakQsQ0FBQztnQkFDSCxDQUFDO2dCQUVELHFDQUFxQztnQkFDckMsb0JBQW9CLEdBQUcsb0JBQW9CO3FCQUN6QyxPQUFPLENBQ1Asa0JBQWtCLENBQUMsTUFBTSxFQUN6QixPQUFPLGFBQVAsT0FBTyxjQUFQLE9BQU8sR0FBSSxTQUFTLENBQUMsVUFBVSxDQUMvQjtxQkFDQSxPQUFPLENBQUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxVQUFVLENBQUM7cUJBQzVELE9BQU8sQ0FDUCxrQkFBa0IsQ0FBQyxTQUFTLEVBQzVCLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FDN0M7cUJBQ0EsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7cUJBQ3pELE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQztxQkFDeEQsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFbkQsSUFBSSxDQUFDO29CQUNKLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDLENBQUM7Z0JBQzlELENBQUM7Z0JBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztvQkFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQixDQUFDO1lBQ0YsQ0FBQztZQUVELElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hELDRCQUE0QjtnQkFDNUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUN6QixNQUFNLG9CQUFvQixHQUFHLHNCQUFzQixDQUFDLE9BQU8sQ0FDMUQsa0JBQWtCLENBQUMsTUFBTSxFQUN6QixPQUFPLGFBQVAsT0FBTyxjQUFQLE9BQU8sR0FBSSxTQUFTLENBQUMsVUFBVSxDQUMvQixDQUFDO29CQUVGLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUMxQyxXQUFXLEVBQ1gsb0JBQW9CLENBQ3BCLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxjQUFjO2dCQUNkLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUU7b0JBQ3ZELE9BQU8sQ0FDTixPQUFPO3dCQUNQLE1BQU07d0JBQ04sa0JBQWtCOzZCQUNoQixPQUFPLENBQ1Asa0JBQWtCLENBQUMsU0FBUyxFQUM1QixTQUFTLENBQUMsT0FBTyxDQUNqQjs2QkFDQSxPQUFPLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQzs2QkFDaEQsT0FBTyxDQUNQLGtCQUFrQixDQUFDLFFBQVEsRUFDM0IsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUNuQjs2QkFDQSxPQUFPLENBQ1Asa0JBQWtCLENBQUMsVUFBVSxFQUM3QixTQUFTLENBQUMsVUFBVSxDQUNwQjs2QkFDQSxPQUFPLENBQ1Asa0JBQWtCLENBQUMsU0FBUyxFQUM1QixxQkFBcUIsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQzdDLENBQ0YsQ0FBQztnQkFDSCxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO1FBRUQsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekIsQ0FBQztDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdW56aXBTeW5jIH0gZnJvbSBcImZmbGF0ZVwiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBBcHAsIFRGaWxlLCBURm9sZGVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBTdXBlcm5vdGVYLCB0b0ltYWdlIH0gZnJvbSBcInN1cGVybm90ZS10eXBlc2NyaXB0XCI7XG5pbXBvcnQgU3VwZXJub3RlRGlnZXN0cyBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBlbmNvZGVQbmcsIEltYWdlIH0gZnJvbSBcImltYWdlLWpzXCI7XG5pbXBvcnQge1xuXHRIRUFEX0FUTEFTX0ZJTEUsXG5cdFRFTVBMQVRFX1ZBUklBQkxFUyxcbn0gZnJvbSBcIi4vY29uc3RhbnRzXCI7XG5pbXBvcnQgYXRsYXNUZW1wbGF0ZSBmcm9tIFwiLi4vdGVtcGxhdGUvYXRsYXNfdGVtcGxhdGUubWRcIjtcbmltcG9ydCBhdG9taWNUZW1wbGF0ZSBmcm9tIFwiLi4vdGVtcGxhdGUvYXRvbWljX3RlbXBsYXRlLm1kXCI7XG5pbXBvcnQgZG9jdW1lbnRIZWFkZXJUZW1wbGF0ZSBmcm9tIFwiLi4vdGVtcGxhdGUvZG9jdW1lbnRfaGVhZGVyLm1kXCI7XG5pbXBvcnQgZGlnZXN0Qm9keVRlbXBsYXRlIGZyb20gXCIuLi90ZW1wbGF0ZS9kaWdlc3QubWRcIjtcblxuaW50ZXJmYWNlIEF0b21pY05vdGVGcm9udE1hdHRlciB7XG5cdG5leHRfbm90ZT86IHN0cmluZztcblx0cHJldmlvdXNfbm90ZT86IHN0cmluZztcbn1cblxudHlwZSBLbm93bGVkZ2VFbnRyeSA9IHtcblx0Y29tbWVudEhhbmR3cml0ZU5hbWU6IHN0cmluZztcblx0Y29tbWVudFN0cjogc3RyaW5nO1xuXHRjb250ZW50OiBzdHJpbmc7XG5cdGNyZWF0aW9uVGltZTogbnVtYmVyO1xuXHRkYXRhTUQ1OiBzdHJpbmc7XG5cdGhhbmR3cml0ZU1ENTogc3RyaW5nO1xuXHRpZDogbnVtYmVyO1xuXHRrbm93bGVkZ2VCYXNlVW5pcXVlQXR0cmlidXRlOiBzdHJpbmc7XG5cdGxhc3RNb2RpZmllZFRpbWU6IG51bWJlcjtcblx0bWV0YWRhdGE6IHN0cmluZztcblx0cGVuZGluZ1N5bmM6IGJvb2xlYW47XG5cdHNlcnZpY2VJZDogbnVtYmVyO1xuXHRzb3VyY2VQYWdlOiBzdHJpbmc7XG5cdHNvdXJjZVBhdGg6IHN0cmluZztcblx0c291cmNlVHlwZTogbnVtYmVyO1xuXHRzdGF0ZTogbnVtYmVyO1xuXHRzeW5jTG9jazogYm9vbGVhbjtcblx0c3luY1N0YXRlOiBudW1iZXI7XG59O1xuXG5mdW5jdGlvbiBhdG9taWNOb3RlRXhpc3RzKFxuXHRkaWdlc3RGb2xkZXI6IFRGb2xkZXIsXG5cdGFwcDogQXBwLFxuXHRub3RlVW5pcXVlSWQ6IHN0cmluZyxcbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZGlnZXN0Rm9sZGVyLmNoaWxkcmVuLnNvbWUoKGYpID0+IHtcblx0XHRpZiAoIShmIGluc3RhbmNlb2YgVEZpbGUpKSByZXR1cm4gZmFsc2U7XG5cblx0XHRjb25zdCBjYWNoZSA9IGFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmKTtcblx0XHRyZXR1cm4gY2FjaGU/LmZyb250bWF0dGVyPy5bXCJzb3VyY2VfaWRcIl0gPT0gbm90ZVVuaXF1ZUlkO1xuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9jdW1lbnROb3RlRXhpc3RzKFxuXHRkb2M6IFRGaWxlIHwgbnVsbCxcblx0YXBwOiBBcHAsXG5cdG5vdGVVbmlxdWVJZDogc3RyaW5nLFxuKSB7XG5cdGlmICghZG9jKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiAoYXdhaXQgYXBwLnZhdWx0LnJlYWQoZG9jKSkuaW5jbHVkZXMobm90ZVVuaXF1ZUlkKTtcbn1cblxuZnVuY3Rpb24gdHJpbUltYWdlQm90dG9tKGltYWdlOiBJbWFnZSwgcGFkZGluZyA9IDgwKTogSW1hZ2Uge1xuXHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IGltYWdlO1xuXHRsZXQgbGFzdENvbnRlbnRSb3cgPSAwO1xuXG5cdGZvciAobGV0IHkgPSBoZWlnaHQgLSAxOyB5ID49IDA7IHktLSkge1xuXHRcdGxldCByb3dIYXNDb250ZW50ID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgeCA9IDA7IHggPCB3aWR0aDsgeCsrKSB7XG5cdFx0XHRjb25zdCBwaXhlbCA9IGltYWdlLmdldFBpeGVsKHgsIHkpO1xuXHRcdFx0aWYgKHBpeGVsWzBdISA8IDI1MCB8fCBwaXhlbFsxXSEgPCAyNTAgfHwgcGl4ZWxbMl0hIDwgMjUwKSB7XG5cdFx0XHRcdHJvd0hhc0NvbnRlbnQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJvd0hhc0NvbnRlbnQpIHtcblx0XHRcdGxhc3RDb250ZW50Um93ID0geTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBpbWFnZS5jcm9wKHtcblx0XHR3aWR0aCxcblx0XHRoZWlnaHQ6IE1hdGgubWluKGxhc3RDb250ZW50Um93ICsgcGFkZGluZywgaGVpZ2h0KSxcblx0fSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU1hcmtJbWFnZUZpbGUoXG5cdG1hcmtCdWZmZXI6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+LFxuXHRpbWFnZVBhdGg6IHN0cmluZyxcblx0YXBwOiBBcHAsXG4pIHtcblx0Ly8gZmluZCBtYXJrIGZpbGVcblxuXHRjb25zdCBtYXJrID0gbmV3IFN1cGVybm90ZVgobWFya0J1ZmZlcik7XG5cdGNvbnN0IGltYWdlcyA9IGF3YWl0IHRvSW1hZ2UobWFyayk7XG5cblx0Y29uc3QgcmF3SW1hZ2UgPSBpbWFnZXNbMF07XG5cdGlmIChyYXdJbWFnZSkge1xuXHRcdGNvbnN0IHBuZ0J1ZmZlciA9XG5cdFx0XHRyYXdJbWFnZSBpbnN0YW5jZW9mIEltYWdlXG5cdFx0XHRcdD8gZW5jb2RlUG5nKHRyaW1JbWFnZUJvdHRvbShyYXdJbWFnZSkpXG5cdFx0XHRcdDogZW5jb2RlUG5nKHJhd0ltYWdlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeShpbWFnZVBhdGgsIHBuZ0J1ZmZlcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBodW1hblJlYWRhYmxlRGF0ZVRpbWUoXG5cdGNyZWF0aW9uVGltZTogbnVtYmVyLFxuXHRmb3JGaWxlUGF0aDogYm9vbGVhbiA9IGZhbHNlLFxuKSB7XG5cdGxldCByZWFkYWJsZURhdGVUaW1lID0gbmV3IERhdGUoY3JlYXRpb25UaW1lKS50b0xvY2FsZVN0cmluZyhcImVuLVVTXCIsIHtcblx0XHR5ZWFyOiBcIm51bWVyaWNcIixcblx0XHRtb250aDogXCJsb25nXCIsXG5cdFx0ZGF5OiBcIm51bWVyaWNcIixcblx0XHRob3VyOiBcIjItZGlnaXRcIixcblx0XHRtaW51dGU6IFwiMi1kaWdpdFwiLFxuXHRcdHNlY29uZDogXCIyLWRpZ2l0XCIsXG5cdH0pO1xuXG5cdGlmIChmb3JGaWxlUGF0aCkge1xuXHRcdHJlYWRhYmxlRGF0ZVRpbWUgPSByZWFkYWJsZURhdGVUaW1lLnJlcGxhY2UoLzovZywgXCIuXCIpO1xuXHR9XG5cdHJldHVybiByZWFkYWJsZURhdGVUaW1lO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0RG9jTmFtZShkb2N1bWVudDogS25vd2xlZGdlRW50cnkpOiBzdHJpbmcge1xuXHRyZXR1cm4gKFxuXHRcdGRvY3VtZW50LnNvdXJjZVBhdGguc3BsaXQoXCIvXCIpLmF0KC0xKT8uc3BsaXQoXCIuXCIpWzBdID8/XG5cdFx0ZG9jdW1lbnQuc291cmNlUGFnZVxuXHQpO1xufVxuXG5mdW5jdGlvbiBkb2N1bWVudHNNYXRjaChcblx0Y3VycmVudDogS25vd2xlZGdlRW50cnksXG5cdHByZXZpb3VzPzogS25vd2xlZGdlRW50cnksXG4pOiBwcmV2aW91cyBpcyBLbm93bGVkZ2VFbnRyeSB7XG5cdGlmICghcHJldmlvdXMpIHJldHVybiBmYWxzZTtcblxuXHRyZXR1cm4gY3VycmVudC5zb3VyY2VQYXRoLmxvY2FsZUNvbXBhcmUocHJldmlvdXMuc291cmNlUGF0aCkgPT0gMDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gZXh0cmFjdERpZ2VzdHNGcm9tQmFja3VwKFxuXHRwYXRoVG9CYWNrdXA6IHN0cmluZyxcblx0YXBwOiBBcHAsXG5cdHBsdWdpbjogU3VwZXJub3RlRGlnZXN0cyxcblx0aW5jcmVtZW50UHJvZ3Jlc3NCYXI6ICh2YWx1ZTogbnVtYmVyKSA9PiB2b2lkLFxuKSB7XG5cdGNvbnN0IHsgcGF0aFRvQXRsYXMsIHBhdGhUb0ltYWdlcywgcGF0aFRvRGlnZXN0cyB9ID0gcGx1Z2luLnNldHRpbmdzO1xuXG5cdC8vIGNoZWNrIGlmIERpZ2VzdHMgZm9sZGVyIGV4aXN0cyBmb2xkZXIgZXhpc3RzXG5cdGxldCBkaWdlc3RGb2xkZXIgPSBhcHAudmF1bHQuZ2V0Rm9sZGVyQnlQYXRoKHBhdGhUb0RpZ2VzdHMpO1xuXHRpZiAoIWRpZ2VzdEZvbGRlcikge1xuXHRcdGRpZ2VzdEZvbGRlciA9IGF3YWl0IGFwcC52YXVsdC5jcmVhdGVGb2xkZXIocGF0aFRvRGlnZXN0cyk7XG5cdH1cblxuXHQvLyBjaGVjayBmb3IgaW1hZ2VzIGZvbGRlciwgY3JlYXRlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0aWYgKCFhcHAudmF1bHQuZ2V0Rm9sZGVyQnlQYXRoKHBhdGhUb0ltYWdlcykpIHtcblx0XHRhd2FpdCBhcHAudmF1bHQuY3JlYXRlRm9sZGVyKHBhdGhUb0ltYWdlcyk7XG5cdH1cblxuXHQvLyBjaGVjayBmb3Igc3VwZXJub3RlX2RpZ2VzdHMgYW5kIGNyZWF0ZSBpZiBub3QgZXhpc3RzXG5cdGlmICghYXBwLnZhdWx0LmdldEZpbGVCeVBhdGgoYCR7cGF0aFRvQXRsYXN9LyR7SEVBRF9BVExBU19GSUxFfS5tZGApKSB7XG5cdFx0Ly8gaWYgYXRsYXMgZm9sZGVyIGRvZXNuJ3QgZXhpc3QsIGNyZWF0ZSBpdFxuXHRcdGlmICghYXBwLnZhdWx0LmdldEZvbGRlckJ5UGF0aChwYXRoVG9BdGxhcykpIHtcblx0XHRcdGF3YWl0IGFwcC52YXVsdC5jcmVhdGVGb2xkZXIocGF0aFRvQXRsYXMpO1xuXHRcdH1cblxuXHRcdGF3YWl0IGFwcC52YXVsdC5jcmVhdGUoXG5cdFx0XHRgJHtwYXRoVG9BdGxhc30vJHtIRUFEX0FUTEFTX0ZJTEV9Lm1kYCxcblx0XHRcdGF0bGFzVGVtcGxhdGVcblx0XHRcdFx0LnJlcGxhY2UoVEVNUExBVEVfVkFSSUFCTEVTLmF0bGFzVGl0bGUsIEhFQURfQVRMQVNfRklMRSlcblx0XHRcdFx0LnJlcGxhY2UoXCJ1cCA6OiBbW3t7aGVhZH19XV1cIiwgXCJcIiksXG5cdFx0KTtcblx0fVxuXG5cdC8vcmVhZCB0aGUgYmFja3VwIGZpbGVcblx0Y29uc3QgYmFja3VwQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKHBhdGhUb0JhY2t1cCk7XG5cblx0Y29uc3Qga25vd2xlZGdlWmlwID0gdW56aXBTeW5jKGJhY2t1cEJ1ZmZlciwge1xuXHRcdGZpbHRlcjogKGYpID0+IGYubmFtZS50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCdrbm93bGVkZ2UuanNvbicpXG5cdH0pO1xuXG5cdGNvbnN0IGtub3dsZWRnZUZpbGVNYXRjaGVzID0gT2JqZWN0LmtleXMoa25vd2xlZGdlWmlwKVxuXHRjb25zdCBba25vd2xlZGdlRmlsZU5hbWUsIC4uLmV4dHJhTWF0Y2hlc10gPSBrbm93bGVkZ2VGaWxlTWF0Y2hlcztcblx0aWYgKCFrbm93bGVkZ2VGaWxlTmFtZSB8fCBleHRyYU1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdGBFeHBlY3RlZCBleGFjdGx5IG9uZSBrbm93bGVkZ2UuanNvbiBtYXRjaCBpbiBiYWNrdXAsIGZvdW5kICR7a25vd2xlZGdlRmlsZU1hdGNoZXMubGVuZ3RofS5gLFxuXHRcdCk7XG5cdH1cblx0Y29uc3Qga25vd2xlZGdlQnl0ZXMgPSBrbm93bGVkZ2VaaXBba25vd2xlZGdlRmlsZU5hbWVdO1xuXHRjb25zdCBrbm93bGVkZ2VKc29uID0ga25vd2xlZGdlQnl0ZXNcblx0XHQ/IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShrbm93bGVkZ2VCeXRlcylcblx0XHQ6IFwiW11cIjtcblxuXHRjb25zdCBwYXJzZWRLbm93bGVkZ2U6IHVua25vd24gPSBKU09OLnBhcnNlKGtub3dsZWRnZUpzb24pO1xuXHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkS25vd2xlZGdlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiTWFsZm9ybWVkIGtub3dsZWRnZS5qc29uIGluIGJhY2t1cCBmaWxlIOKAlCBleHBlY3RlZCBhbiBhcnJheSBvZiBkaWdlc3QgZW50cmllcy5cIixcblx0XHQpO1xuXHR9XG5cdGxldCBrbm93bGVkZ2VGaWxlID0gcGFyc2VkS25vd2xlZGdlIGFzIEtub3dsZWRnZUVudHJ5W107XG5cblx0a25vd2xlZGdlRmlsZS5zb3J0KChhLCBiKSA9PiBhLnNvdXJjZVBhdGgubG9jYWxlQ29tcGFyZShiLnNvdXJjZVBhdGgpKTtcblxuXHQvLyBMaXN0IG9mIERvY3VtZW50cyBmb3IgQXRsYXNcblx0Y29uc3QgZG9jdW1lbnRzOiBSZWNvcmQ8c3RyaW5nLCBURmlsZSB8IG51bGw+ID0ge307XG5cblx0Ly9pdGVyYXRlIHRocm91Z2ggdGhlIGtub3dsZWRnZS5qc29uIGZpbGUgdG8gZmluZCBtYXJrIGZpbGVzXG5cdGZvciAoY29uc3QgW2luZGV4LCBrbm93bGVkZ2VdIG9mIGtub3dsZWRnZUZpbGUuZW50cmllcygpKSB7XG5cdFx0Ly8gZ2VuZXJhdGUgdW5pcXVlIGlkIGZvciBlYWNoIG1hcmsgYW5kIHRoZW4gY2hlY2sgaWYgaXQgYWxyZWFkeSBleGlzdHMgaW4gb3VyIHZhdWx0XG5cdFx0Y29uc3Qgc291cmNlSWQgPSBrbm93bGVkZ2UuY3JlYXRpb25UaW1lO1xuXHRcdGNvbnN0IGRhdGVCYXNlZEZpbGVOYW1lID0gaHVtYW5SZWFkYWJsZURhdGVUaW1lKHNvdXJjZUlkLCB0cnVlKTtcblxuXHRcdC8vZ2V0IGRvYyBmb3IgZG9jdW1lbnQgc3R5bGUgbm90ZXNcblx0XHRjb25zdCBkb2NOYW1lID0gZXh0cmFjdERvY05hbWUoa25vd2xlZGdlKTtcblx0XHQvL2dldCBkb2NGaWxlIHBhdGggYmFzZWQgb24gYXRvbWljIHZzIGRvY3VtZW50IHN0eWxlIG5vdGVzXG5cdFx0bGV0IGRvY0ZpbGVQYXRoID0gYCR7cGF0aFRvRGlnZXN0c30vJHtkb2NOYW1lfS5tZGA7XG5cblx0XHRpZiAocGx1Z2luLnNldHRpbmdzLm5vdGVPcmdTdHlsZSA9PSBcImF0b21pY1wiKSB7XG5cdFx0XHRkb2NGaWxlUGF0aCA9IGAke3BhdGhUb0F0bGFzfS8ke2RvY05hbWV9Lm1kYDtcblx0XHR9XG5cblx0XHRsZXQgYXRvbWljTm90ZVBhdGggPSBgJHtwYXRoVG9EaWdlc3RzfS8ke2RhdGVCYXNlZEZpbGVOYW1lfS5tZGA7XG5cblx0XHRkb2N1bWVudHNbZG9jTmFtZV0gPSBhcHAudmF1bHQuZ2V0RmlsZUJ5UGF0aChkb2NGaWxlUGF0aCk7XG5cblx0XHQvLyBjaGVjayBpZiBub3RlIGhhcyBhbHJlYWR5IGJlZW4gY3JlYXRlZFxuXHRcdGxldCBub3RlRXhpc3RzID0gZmFsc2U7XG5cdFx0aWYgKHBsdWdpbi5zZXR0aW5ncy5ub3RlT3JnU3R5bGUgPT0gXCJhdG9taWNcIikge1xuXHRcdFx0bm90ZUV4aXN0cyA9IGF0b21pY05vdGVFeGlzdHMoXG5cdFx0XHRcdGRpZ2VzdEZvbGRlcixcblx0XHRcdFx0YXBwLFxuXHRcdFx0XHRzb3VyY2VJZC50b1N0cmluZygpLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAocGx1Z2luLnNldHRpbmdzLm5vdGVPcmdTdHlsZSA9PSBcImRvY3VtZW50XCIpIHtcblx0XHRcdG5vdGVFeGlzdHMgPSBhd2FpdCBkb2N1bWVudE5vdGVFeGlzdHMoXG5cdFx0XHRcdGRvY3VtZW50c1tkb2NOYW1lXSxcblx0XHRcdFx0YXBwLFxuXHRcdFx0XHRzb3VyY2VJZC50b1N0cmluZygpLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBwcm9ncmVzcyBiYXIgbG9naWNcblx0XHRjb25zdCBwcm9ncmVzcyA9ICgxMDAgLyBrbm93bGVkZ2VGaWxlLmxlbmd0aCkgKiAoaW5kZXggKyAxKTtcblx0XHRpbmNyZW1lbnRQcm9ncmVzc0Jhcihwcm9ncmVzcyk7XG5cblx0XHQvLyBuZXh0IGFuZCBwZXJ2aW91cyBsb2dpY1xuXHRcdGNvbnN0IHByZXZpb3VzS25vd2xlZGdlRW50cnkgPSBrbm93bGVkZ2VGaWxlW2luZGV4IC0gMV07XG5cdFx0Y29uc3QgbmV4dEtvd2xlZGdlRW50cnkgPSBrbm93bGVkZ2VGaWxlW2luZGV4ICsgMV07XG5cdFx0bGV0IGZpbGxlZEF0b21pY1RlbXBsYXRlID0gYXRvbWljVGVtcGxhdGU7XG5cdFx0Ly8gY2hlY2sgaWYgZG9jdW1lbnRzIG1hdGNoXG5cdFx0aWYgKGRvY3VtZW50c01hdGNoKGtub3dsZWRnZSwgcHJldmlvdXNLbm93bGVkZ2VFbnRyeSkpIHtcblx0XHRcdC8vIGNoZWNrIGlmIHByZXZpb3VzIG5vdGUgZXhpc3RzXG5cdFx0XHRpZiAobm90ZUV4aXN0cykge1xuXHRcdFx0XHRjb25zdCBmaWxlID0gYXBwLnZhdWx0LmdldEZpbGVCeVBhdGgoYXRvbWljTm90ZVBhdGgpO1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGF3YWl0IGFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoXG5cdFx0XHRcdFx0XHRmaWxlLFxuXHRcdFx0XHRcdFx0KGZtOiBBdG9taWNOb3RlRnJvbnRNYXR0ZXIpID0+IHtcblx0XHRcdFx0XHRcdFx0Zm0ucHJldmlvdXNfbm90ZSA9IGBbWyR7aHVtYW5SZWFkYWJsZURhdGVUaW1lKHByZXZpb3VzS25vd2xlZGdlRW50cnkuY3JlYXRpb25UaW1lLCB0cnVlKX1dXWA7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpbGxlZEF0b21pY1RlbXBsYXRlID0gZmlsbGVkQXRvbWljVGVtcGxhdGUucmVwbGFjZShcblx0XHRcdFx0XHRURU1QTEFURV9WQVJJQUJMRVMucHJldmlvdXNOb3RlLFxuXHRcdFx0XHRcdGh1bWFuUmVhZGFibGVEYXRlVGltZShcblx0XHRcdFx0XHRcdHByZXZpb3VzS25vd2xlZGdlRW50cnkuY3JlYXRpb25UaW1lLFxuXHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWxsZWRBdG9taWNUZW1wbGF0ZSA9IGZpbGxlZEF0b21pY1RlbXBsYXRlLnJlcGxhY2UoXG5cdFx0XHRcdGBwcmV2aW91c19ub3RlOiBcIltbJHtURU1QTEFURV9WQVJJQUJMRVMucHJldmlvdXNOb3RlfV1dXCJcXG5gLFxuXHRcdFx0XHRcIlwiLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoZG9jdW1lbnRzTWF0Y2goa25vd2xlZGdlLCBuZXh0S293bGVkZ2VFbnRyeSkpIHtcblx0XHRcdC8vIGlmIGEgbmV4dCBlbnRyeSBoYXMgYmVjb21lIGF2YWlsYWJsZSBzaW5jZSB0aGlzIG5vdGUgd2FzIGNyZWF0ZWQsXG5cdFx0XHQvLyBwYXRjaCBpdHMgZnJvbnRtYXR0ZXIgZGlyZWN0bHkgaW5zdGVhZCBvZiByZWNyZWF0aW5nIHRoZSB3aG9sZSBub3RlXG5cdFx0XHRpZiAobm90ZUV4aXN0cykge1xuXHRcdFx0XHRjb25zdCBmaWxlID0gYXBwLnZhdWx0LmdldEZpbGVCeVBhdGgoYXRvbWljTm90ZVBhdGgpO1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGF3YWl0IGFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoXG5cdFx0XHRcdFx0XHRmaWxlLFxuXHRcdFx0XHRcdFx0KGZtOiBBdG9taWNOb3RlRnJvbnRNYXR0ZXIpID0+IHtcblx0XHRcdFx0XHRcdFx0Zm0ubmV4dF9ub3RlID0gYFtbJHtodW1hblJlYWRhYmxlRGF0ZVRpbWUobmV4dEtvd2xlZGdlRW50cnkuY3JlYXRpb25UaW1lLCB0cnVlKX1dXWA7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpbGxlZEF0b21pY1RlbXBsYXRlID0gZmlsbGVkQXRvbWljVGVtcGxhdGUucmVwbGFjZShcblx0XHRcdFx0XHRURU1QTEFURV9WQVJJQUJMRVMubmV4dE5vdGUsXG5cdFx0XHRcdFx0aHVtYW5SZWFkYWJsZURhdGVUaW1lKG5leHRLb3dsZWRnZUVudHJ5LmNyZWF0aW9uVGltZSwgdHJ1ZSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbGxlZEF0b21pY1RlbXBsYXRlID0gZmlsbGVkQXRvbWljVGVtcGxhdGUucmVwbGFjZShcblx0XHRcdFx0YG5leHRfbm90ZTogXCJbWyR7VEVNUExBVEVfVkFSSUFCTEVTLm5leHROb3RlfV1dXCJcXG5gLFxuXHRcdFx0XHRcIlwiLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0Ly8gbm90ZSBleGlzdHMgc28gc2tpcCBub3RlIGNyZWF0aW9uIGFuZCBtYXJrIGZpbGUgZXh0cmFjdGlvblxuXHRcdGlmIChub3RlRXhpc3RzKSBjb250aW51ZTtcblxuXHRcdC8vIENyZWF0ZSBNYXJrIEltYWdlXG5cdFx0Y29uc3QgaW1hZ2VQYXRoID0gYCR7cGF0aFRvSW1hZ2VzfS8ke3NvdXJjZUlkfS5wbmdgO1xuXHRcdGNvbnN0IGltYWdlRXhpc3RzID0gYXBwLnZhdWx0LmdldEZpbGVCeVBhdGgoaW1hZ2VQYXRoKTtcblx0XHRpZiAoIWltYWdlRXhpc3RzKSB7XG5cdFx0XHQvLyBjb25zdCBtYXJrUGF0aCA9IGAke1BBVEhfVE9fTUFSS19GSUxFU30ke2tub3dsZWRnZS5jb21tZW50SGFuZHdyaXRlTmFtZX1gO1xuXHRcdFx0Y29uc3QgbWFya1ppcCA9IHVuemlwU3luYyhiYWNrdXBCdWZmZXIsIHtcblx0XHRcdFx0ZmlsdGVyOiAoZikgPT4gZi5uYW1lLmVuZHNXaXRoKGtub3dsZWRnZS5jb21tZW50SGFuZHdyaXRlTmFtZSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG1hcmtNYXRjaGVzID0gT2JqZWN0LmtleXMobWFya1ppcClcblx0XHRcdGNvbnN0IFttYXJrUGF0aCwgLi4uZXh0cmFNYXRjaGVzXSA9IG1hcmtNYXRjaGVzXG5cdFx0XHRpZiAoIW1hcmtQYXRoIHx8IGV4dHJhTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignUGF0aCB0byBoYW5kd3JpdHRlbiBub3RlIG5vdCBmb3VuZCcpXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYXJrQnVmZmVyID0gbWFya1ppcFttYXJrUGF0aF07XG5cdFx0XHRpZiAobWFya0J1ZmZlcikge1xuXHRcdFx0XHRhd2FpdCBjcmVhdGVNYXJrSW1hZ2VGaWxlKG1hcmtCdWZmZXIsIGltYWdlUGF0aCwgYXBwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvL2dyYWIgYXRvbWljIHRlbXBsYXRlIHNvIGl0IGNhbiBiZSBmaWxsZWRcblxuXHRcdGlmIChwbHVnaW4uc2V0dGluZ3Mubm90ZU9yZ1N0eWxlID09IFwiYXRvbWljXCIpIHtcblx0XHRcdC8vIGNoZWNrIGZvciBhdGxhcyBkb2N1bWVudFxuXHRcdFx0Ly8gaWYgaXQgZG9lc24ndCBleGlzdCB0aGFuIGNyZWF0ZSBpdCBhbmQgYWRkIHRoZSBNT0MgdGVtcGxhdGVcblx0XHRcdGlmICghZG9jdW1lbnRzW2RvY05hbWVdKSB7XG5cdFx0XHRcdGRvY3VtZW50c1tkb2NOYW1lXSA9IGF3YWl0IGFwcC52YXVsdC5jcmVhdGUoXG5cdFx0XHRcdFx0ZG9jRmlsZVBhdGgsXG5cdFx0XHRcdFx0YXRsYXNUZW1wbGF0ZVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoVEVNUExBVEVfVkFSSUFCTEVTLmF0bGFzSGVhZCwgSEVBRF9BVExBU19GSUxFKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoVEVNUExBVEVfVkFSSUFCTEVTLmF0bGFzVGl0bGUsIGRvY05hbWUpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWxsIEluIFRlbXBsYXRlcyBmb3IgQXRvbWljIE5vdGVzXG5cdFx0XHRmaWxsZWRBdG9taWNUZW1wbGF0ZSA9IGZpbGxlZEF0b21pY1RlbXBsYXRlXG5cdFx0XHRcdC5yZXBsYWNlKFxuXHRcdFx0XHRcdFRFTVBMQVRFX1ZBUklBQkxFUy5zb3VyY2UsXG5cdFx0XHRcdFx0ZG9jTmFtZSA/PyBrbm93bGVkZ2Uuc291cmNlUGF0aCxcblx0XHRcdFx0KVxuXHRcdFx0XHQucmVwbGFjZShURU1QTEFURV9WQVJJQUJMRVMuc291cmNlUGFnZSwga25vd2xlZGdlLnNvdXJjZVBhZ2UpXG5cdFx0XHRcdC5yZXBsYWNlKFxuXHRcdFx0XHRcdFRFTVBMQVRFX1ZBUklBQkxFUy5jcmVhdGVkT24sXG5cdFx0XHRcdFx0aHVtYW5SZWFkYWJsZURhdGVUaW1lKGtub3dsZWRnZS5jcmVhdGlvblRpbWUpLFxuXHRcdFx0XHQpXG5cdFx0XHRcdC5yZXBsYWNlKFRFTVBMQVRFX1ZBUklBQkxFUy5zb3VyY2VJZCwgc291cmNlSWQudG9TdHJpbmcoKSlcblx0XHRcdFx0LnJlcGxhY2UoVEVNUExBVEVfVkFSSUFCTEVTLmhpZ2hsaWdodCwga25vd2xlZGdlLmNvbnRlbnQpXG5cdFx0XHRcdC5yZXBsYWNlKFRFTVBMQVRFX1ZBUklBQkxFUy5pbWFnZVBhdGgsIGltYWdlUGF0aCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFwcC52YXVsdC5jcmVhdGUoYXRvbWljTm90ZVBhdGgsIGZpbGxlZEF0b21pY1RlbXBsYXRlKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBsdWdpbi5zZXR0aW5ncy5ub3RlT3JnU3R5bGUgPT0gXCJkb2N1bWVudFwiKSB7XG5cdFx0XHQvL2NoZWNrIGlmIHRoZSBoZWFkZXIgZXhpc3RzXG5cdFx0XHRpZiAoIWRvY3VtZW50c1tkb2NOYW1lXSkge1xuXHRcdFx0XHRjb25zdCBmaWxsZWRUZW1wbGF0ZUhlYWRlciA9IGRvY3VtZW50SGVhZGVyVGVtcGxhdGUucmVwbGFjZShcblx0XHRcdFx0XHRURU1QTEFURV9WQVJJQUJMRVMuc291cmNlLFxuXHRcdFx0XHRcdGRvY05hbWUgPz8ga25vd2xlZGdlLnNvdXJjZVBhdGgsXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0ZG9jdW1lbnRzW2RvY05hbWVdID0gYXdhaXQgYXBwLnZhdWx0LmNyZWF0ZShcblx0XHRcdFx0XHRkb2NGaWxlUGF0aCxcblx0XHRcdFx0XHRmaWxsZWRUZW1wbGF0ZUhlYWRlcixcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly9yZWFkIGRvY0ZpbGVcblx0XHRcdGF3YWl0IGFwcC52YXVsdC5wcm9jZXNzKGRvY3VtZW50c1tkb2NOYW1lXSwgKGNvbnRlbnQpID0+IHtcblx0XHRcdFx0cmV0dXJuIChcblx0XHRcdFx0XHRjb250ZW50ICtcblx0XHRcdFx0XHRcIlxcblxcblwiICtcblx0XHRcdFx0XHRkaWdlc3RCb2R5VGVtcGxhdGVcblx0XHRcdFx0XHRcdC5yZXBsYWNlKFxuXHRcdFx0XHRcdFx0XHRURU1QTEFURV9WQVJJQUJMRVMuaGlnaGxpZ2h0LFxuXHRcdFx0XHRcdFx0XHRrbm93bGVkZ2UuY29udGVudCxcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdC5yZXBsYWNlKFRFTVBMQVRFX1ZBUklBQkxFUy5pbWFnZVBhdGgsIGltYWdlUGF0aClcblx0XHRcdFx0XHRcdC5yZXBsYWNlKFxuXHRcdFx0XHRcdFx0XHRURU1QTEFURV9WQVJJQUJMRVMuc291cmNlSWQsXG5cdFx0XHRcdFx0XHRcdHNvdXJjZUlkLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQucmVwbGFjZShcblx0XHRcdFx0XHRcdFx0VEVNUExBVEVfVkFSSUFCTEVTLnNvdXJjZVBhZ2UsXG5cdFx0XHRcdFx0XHRcdGtub3dsZWRnZS5zb3VyY2VQYWdlLFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoXG5cdFx0XHRcdFx0XHRcdFRFTVBMQVRFX1ZBUklBQkxFUy5jcmVhdGVkT24sXG5cdFx0XHRcdFx0XHRcdGh1bWFuUmVhZGFibGVEYXRlVGltZShrbm93bGVkZ2UuY3JlYXRpb25UaW1lKSxcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGluY3JlbWVudFByb2dyZXNzQmFyKDApO1xufVxuIl19