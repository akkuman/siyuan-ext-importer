import { assetBaseDir, calculateMD5, parseHTML, sanitizeFileName } from '../../util.js';
import { ZipEntryFile } from '../../zip.js';
import { NotionResolverInfo } from './notion-types.js';
import { getNotionId, parseParentIds } from './notion-utils.js';


export async function parseFileInfo(info: NotionResolverInfo, file: ZipEntryFile) {
	let { filepath } = file;

	if (file.extension === 'html') {
		const text = await file.readText();

		const dom = parseHTML(text);
		const body = dom.querySelector('body');
		const children = body.children;
		let id: string | undefined;
		for (let i = 0; i < children.length; i++) {
			id = getNotionId(children[i].getAttribute('id') ?? '');
			if (id) break;
		}
		if (!id) {
			throw new Error('no id found for: ' + filepath);
		}

		const ctime = extractTimeFromDOMElement(dom, 'property-row-created_time');
		const mtime = extractTimeFromDOMElement(dom, 'property-row-last_edited_time');

		// Because Notion cuts titles to be very short and chops words in half, we read the complete title from the HTML to get full words. Worth the extra processing time.
		const parsedTitle = dom.querySelector('title')?.textContent || 'Untitled';

		let title = stripTo200(sanitizeFileName(
			parsedTitle
				.replace(/\n/g, ' ')
				.replace(/[:\/]/g, '-')
				.replace(/#/g, '')
				.trim()
		)); 

		info.idsToFileInfo[id] = {
			path: filepath,
			parentIds: parseParentIds(filepath),
			ctime,
			mtime,
			title,
			blockID: '',
			hasContent: Boolean((dom.querySelector('div[class=page-body]') as HTMLElement)?.innerHTML.trim().length)
		};
	}
	else {
        let hashFileName = calculateMD5(file.fullpath);
        let nameWithExtension = decodeURI(sanitizeFileName(file.name));
        const parts = nameWithExtension.split('.');
        let fileExt = '';
        if (parts.length > 0) {
            fileExt = parts.pop()
        }
        let displayPathInSiYuan = `${assetBaseDir}/notion/${hashFileName.substring(0, 2)}/${hashFileName}.${fileExt}`
		info.pathsToAttachmentInfo[filepath] = {
			path: filepath,
			parentIds: parseParentIds(filepath),
			nameWithExtension: nameWithExtension,
			targetParentFolder: '',
            pathInSiYuanMd: displayPathInSiYuan,
            pathInSiYuanFs: `/data/${displayPathInSiYuan}`
		};
	}
}

function stripTo200(title: string) {
	if (title.length < 200) return title;	
	
	// just in case title names are too long
	const wordList = title.split(' ');
	const titleList = [];
	let length = 0;
	let i = 0;
	let hasCompleteTitle = false;
	while (length < 200) {
		if (!wordList[i]) {
			hasCompleteTitle = true;
			break;
		}
		titleList.push(wordList[i]);
		length += wordList[i].length + 1;
	}
	let strippedTitle = titleList.join(' ');
	if (!hasCompleteTitle) strippedTitle += '...';
	return strippedTitle;
}

// Function to parse the date-time string
function parseDateTime(dateTimeStr: string): Date | null {
	// If the string starts with "@", skip the first character
	const cleanedStr = dateTimeStr.startsWith('@') ? dateTimeStr.substr(1).trim() : dateTimeStr.trim();

	// Use the built-in Date constructor
	const dateObj = new Date(cleanedStr);

	// Check if the resulting date object is valid
	if (isNaN(dateObj.getTime())) {
		return null;
	}

	return dateObj;
}

function extractTimeFromDOMElement(dom: HTMLElement, trClassName: string): Date | null {
	// Select the <tr> element with the specified class from the provided DOM
	const trElement = dom.querySelector(`tr.${trClassName}`);

	if (trElement) {
		// If the <tr> element exists, select the <time> element within it
		const timeElement = trElement.querySelector('time');

		// Return the inner text of the <time> element or null if not found
		return timeElement && timeElement.textContent ? parseDateTime(timeElement.textContent) : null;
	}

	return null;
}
