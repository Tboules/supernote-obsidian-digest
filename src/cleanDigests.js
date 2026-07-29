import { __awaiter } from "tslib";
import { TFile } from "obsidian";
import { FRONTMATTER_GENERATED_BY } from "./constants";
export default function cleanDigests(app, plugin) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const { pathToAtlas, pathToDigests } = plugin.settings;
        const digests = app.vault.getFolderByPath(pathToDigests);
        const atlasFiles = app.vault.getFolderByPath(pathToAtlas);
        const digestChildren = (_a = digests === null || digests === void 0 ? void 0 : digests.children) !== null && _a !== void 0 ? _a : [];
        const combinedFiles = digestChildren.concat((_b = atlasFiles === null || atlasFiles === void 0 ? void 0 : atlasFiles.children) !== null && _b !== void 0 ? _b : []);
        for (const file of combinedFiles) {
            if (!(file instanceof TFile))
                continue;
            if (((_d = (_c = app.metadataCache.getFileCache(file)) === null || _c === void 0 ? void 0 : _c.frontmatter) === null || _d === void 0 ? void 0 : _d["generated_by"]) == FRONTMATTER_GENERATED_BY) {
                yield app.fileManager.trashFile(file);
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xlYW5EaWdlc3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2xlYW5EaWdlc3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPLEVBQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRXRDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUV2RCxNQUFNLENBQUMsT0FBTyxVQUFnQixZQUFZLENBQUMsR0FBUSxFQUFFLE1BQXdCOzs7UUFDNUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxhQUFhLEVBQUUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBRXZELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRXpELE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTFELE1BQU0sY0FBYyxHQUFHLE1BQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLFFBQVEsbUNBQUksRUFBRSxDQUFDO1FBRS9DLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsUUFBUSxtQ0FBSSxFQUFFLENBQUMsQ0FBQztRQUV4RSxLQUFLLE1BQU0sSUFBSSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxLQUFLLENBQUM7Z0JBQUUsU0FBUztZQUV2QyxJQUNDLENBQUEsTUFBQSxNQUFBLEdBQUcsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQywwQ0FBRSxXQUFXLDBDQUNoRCxjQUFjLENBQ2QsS0FBSSx3QkFBd0IsRUFDNUIsQ0FBQztnQkFDRixNQUFNLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IFN1cGVybm90ZURpZ2VzdHMgZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHsgRlJPTlRNQVRURVJfR0VORVJBVEVEX0JZIH0gZnJvbSBcIi4vY29uc3RhbnRzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jIGZ1bmN0aW9uIGNsZWFuRGlnZXN0cyhhcHA6IEFwcCwgcGx1Z2luOiBTdXBlcm5vdGVEaWdlc3RzKSB7XG5cdGNvbnN0IHsgcGF0aFRvQXRsYXMsIHBhdGhUb0RpZ2VzdHMgfSA9IHBsdWdpbi5zZXR0aW5ncztcblxuXHRjb25zdCBkaWdlc3RzID0gYXBwLnZhdWx0LmdldEZvbGRlckJ5UGF0aChwYXRoVG9EaWdlc3RzKTtcblxuXHRjb25zdCBhdGxhc0ZpbGVzID0gYXBwLnZhdWx0LmdldEZvbGRlckJ5UGF0aChwYXRoVG9BdGxhcyk7XG5cblx0Y29uc3QgZGlnZXN0Q2hpbGRyZW4gPSBkaWdlc3RzPy5jaGlsZHJlbiA/PyBbXTtcblxuXHRjb25zdCBjb21iaW5lZEZpbGVzID0gZGlnZXN0Q2hpbGRyZW4uY29uY2F0KGF0bGFzRmlsZXM/LmNoaWxkcmVuID8/IFtdKTtcblxuXHRmb3IgKGNvbnN0IGZpbGUgb2YgY29tYmluZWRGaWxlcykge1xuXHRcdGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIGNvbnRpbnVlO1xuXG5cdFx0aWYgKFxuXHRcdFx0YXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlcj8uW1xuXHRcdFx0XHRcImdlbmVyYXRlZF9ieVwiXG5cdFx0XHRdID09IEZST05UTUFUVEVSX0dFTkVSQVRFRF9CWVxuXHRcdCkge1xuXHRcdFx0YXdhaXQgYXBwLmZpbGVNYW5hZ2VyLnRyYXNoRmlsZShmaWxlKTtcblx0XHR9XG5cdH1cbn1cbiJdfQ==