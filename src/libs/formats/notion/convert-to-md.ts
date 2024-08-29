import moment from 'moment';
import { parseFilePath } from '../../filesystem.js';
import { HTMLElementfindAll, parseHTML, serializeFrontMatter, createEl, createSpan } from '../../util.js';
import { ZipEntryFile } from '../../zip.js';
import { NotionLink, NotionProperty, NotionPropertyType, NotionResolverInfo, YamlProperty } from './notion-types.js';
import {
	escapeHashtags,
	getNotionId,
	hoistChildren,
	parseDate,
	stripNotionId,
	stripParentDirectories,
} from './notion-utils.js';

let lute = window.Lute.New();

function htmlToMarkdown(html: string): string {
    return lute.HTML2Md(html)
}

export async function readToMarkdown(info: NotionResolverInfo, file: ZipEntryFile): Promise<string> {
	const text = await file.readText();

	const dom = parseHTML(text);
	// read the files etc.
	const body: HTMLElement = dom.querySelector('div[class=page-body]');

	if (body === null) {
		throw new Error('page body was not found');
	}

	const notionLinks = getNotionLinks(info, body);
	convertLinksToObsidian(info, notionLinks, true);

	let frontMatter: any = {};

	const rawProperties = dom.querySelector('table[class=properties] > tbody') as HTMLTableSectionElement | undefined;
	if (rawProperties) {
		const propertyLinks = getNotionLinks(info, rawProperties);
		convertLinksToObsidian(info, propertyLinks, false);
		// YAML only takes raw URLS
		convertHtmlLinksToURLs(rawProperties);

		for (let row of Array.from(rawProperties.rows)) {
			const property = parseProperty(row);
			if (property) {
				if (property.title == 'Tags') {
					property.title = 'tags';
					if (typeof property.content === 'string') {
						property.content = property.content.replace(/ /g, '-');
					}
					else if (property.content instanceof Array) {
						property.content = property.content.map(tag => tag.replace(/ /g, '-'));
					}
				}
				frontMatter[property.title] = property.content;
			}
		}
	}

	replaceNestedTags(body, 'strong');
	replaceNestedTags(body, 'em');
	fixNotionEmbeds(body);
	fixNotionCallouts(body);
	stripLinkFormatting(body);
	encodeNewlinesToBr(body);
	fixNotionDates(body);
	fixEquations(body);

	// Some annoying elements Notion throws in as wrappers, which mess up .md
	replaceElementsWithChildren(body, 'div.indented');
	replaceElementsWithChildren(body, 'details');
	fixToggleHeadings(body);
	fixNotionLists(body, 'ul');
	fixNotionLists(body, 'ol');

	addCheckboxes(body);
	replaceTableOfContents(body);
	formatDatabases(body);

    cleanInvalidDOM(body);

	let htmlString = body.innerHTML;
	
	// Simpler to just use the HTML string for this replacement
	splitBrsInFormatting(htmlString, 'strong');
	splitBrsInFormatting(htmlString, 'em');
	

	let markdownBody = htmlToMarkdown(htmlString);
	if (info.singleLineBreaks) {
		// Making sure that any blockquote is preceded by an empty line (otherwise messes up formatting with consecutive blockquotes / callouts)
		markdownBody = markdownBody.replace(/\n\n(?!>)/g, '\n');
	}
	
	markdownBody = escapeHashtags(markdownBody);
	markdownBody = fixDoubleBackslash(markdownBody);

	const description = dom.querySelector('p[class*=page-description]')?.textContent;
	if (description) markdownBody = description + '\n\n' + markdownBody;

	return serializeFrontMatter(frontMatter) + markdownBody;
}

const typesMap: Record<NotionProperty['type'], NotionPropertyType[]> = {
	checkbox: ['checkbox'],
	date: ['created_time', 'last_edited_time', 'date'],
	list: ['file', 'multi_select', 'relation'],
	number: ['number', 'auto_increment_id'],
	text: [
		'email',
		'person',
		'phone_number',
		'text',
		'url',
		'status',
		'select',
		'formula',
		'rollup',
		'last_edited_by',
		'created_by',
	],
};

function parseProperty(property: HTMLTableRowElement): YamlProperty | undefined {
	const notionType = property.className.match(/property-row-(.*)/)?.[1] as NotionPropertyType;
	if (!notionType) {
		throw new Error('property type not found for: ' + property);
	}

	const title = htmlToMarkdown(property.cells[0].textContent ?? '');

	const body = property.cells[1];

	let type = Object.keys(typesMap).find((type: string) =>
		typesMap[type as NotionProperty['type']].includes(notionType)
	) as NotionProperty['type'];

	if (!type) throw new Error('type not found for: ' + body);

	let content: YamlProperty['content'] = '';

	switch (type) {
		case 'checkbox':
			// checkbox-on: checked, checkbox-off: unchecked.
			content = body.innerHTML.includes('checkbox-on');
			break;
		case 'number':
			content = Number(body.textContent);
			if (isNaN(content)) return;
			break;
		case 'date':
			fixNotionDates(body);
			const dates = body.getElementsByTagName('time');
			if (dates.length === 0) {
				content = '';
			}
			else if (dates.length === 1) {
				content = parseDate(moment(dates.item(0)?.textContent));
			}
			else {
				const dateList = [];
				for (let i = 0; i < dates.length; i++) {
					dateList.push(
						parseDate(moment(dates.item(i)?.textContent))
					);
				}
				content = dateList.join(' - ');
			}
			if (content.length === 0) return;
			break;
		case 'list':
			const children = body.children;
			const childList: string[] = [];
			for (let i = 0; i < children.length; i++) {
				const itemContent = children.item(i)?.textContent;
				if (!itemContent) continue;
				childList.push(itemContent);
			}
			content = childList;			
			if (content.length === 0) return;
			break;
		case 'text':
			content = body.textContent ?? '';
			if (content.length === 0) return;
			break;
	}

	return {
		title,
		content,
	};
}

function getNotionLinks(info: NotionResolverInfo, body: HTMLElement) {
	const links: NotionLink[] = [];

	for (const a of HTMLElementfindAll(body, 'a') as HTMLAnchorElement[]) {
		const decodedURI = stripParentDirectories(
			decodeURI(a.getAttribute('href') ?? '')
		);
		const id = getNotionId(decodedURI);

		const attachmentPath = Object.keys(info.pathsToAttachmentInfo)
			.find(filename => filename.includes(decodedURI));
		if (id && decodedURI.endsWith('.html')) {
			links.push({ type: 'relation', a, id });
		}
		else if (attachmentPath) {
			links.push({
				type: 'attachment',
				a,
				path: attachmentPath,
			});
		}
	}

	return links;
}

function fixDoubleBackslash(markdownBody: string) {
	// Persistent error during conversion where backslashes in full-path links written as '\\|' become double-slashes \\| in the markdown.
	// In tables, we have to use \| in internal links. This corrects the erroneous \\| in markdown.

	const slashSearch = /\[\[[^\]]*(\\\\)\|[^\]]*\]\]/;
	const doubleSlashes = markdownBody.match(new RegExp(slashSearch, 'g'));
	doubleSlashes?.forEach((slash) => {
		markdownBody = markdownBody.replace(
			slash,
			slash.replace(/\\\\\|/g, '\u005C|')
		);
	});

	return markdownBody;
}

function fixEquations(body: HTMLElement) {
	const katexEls = HTMLElementfindAll(body, '.katex');
	for (const katex of katexEls) {
		const annotation = katex.querySelector('annotation');
		if (!annotation) continue;
		annotation.textContent = `$${annotation.textContent}$`;
		katex.replaceWith(annotation);
	}
}

function stripToSentence(paragraph: string) {
	const firstSentence = paragraph.match(/^[^\.\?\!\n]*[\.\?\!]?/)?.[0];
	return firstSentence ?? '';
}

function isCallout(element: Element) {
	return !!(/callout|bookmark/.test(element.getAttribute('class') ?? ''));
}

function fixNotionCallouts(body: HTMLElement) {
	for (let callout of HTMLElementfindAll(body, 'figure.callout')) {
		const description = callout.children[1].textContent;
		let calloutBlock = `> [!important]\n> ${description}\n`;
		if (callout.nextElementSibling && isCallout(callout.nextElementSibling)) {
			calloutBlock += '\n';
		}
		callout.replaceWith(calloutBlock);
	}
}

function fixNotionEmbeds(body: HTMLElement) {
	// Notion embeds are a box with images and description, we simplify for Obsidian.
	for (let embed of HTMLElementfindAll(body, 'a.bookmark.source')) {
		const link = embed.getAttribute('href');
		const title = embed.querySelector('div.bookmark-title')?.textContent;
		const description = stripToSentence(embed.querySelector('div.bookmark-description')?.textContent ?? '');
		let calloutBlock = `> [!info] ${title}\n` + `> ${description}\n` + `> [${link}](${link})\n`;
		if (embed.nextElementSibling && isCallout(embed.nextElementSibling)) {
			// separate callouts with spaces
			calloutBlock += '\n';
		}
		embed.replaceWith(calloutBlock);
	}
}

function formatDatabases(body: HTMLElement) {
	// Notion includes user SVGs which aren't relevant to Markdown, so change them to pure text.
	for (const user of HTMLElementfindAll(body, 'span[class=user]')) {
		user.innerText = user.textContent ?? '';
	}

	for (const checkbox of HTMLElementfindAll(body, 'td div[class*=checkbox]')) {
		const newCheckbox = createSpan();
		newCheckbox.textContent = checkbox.classList.contains('checkbox-on') ? 'X' : '';
		checkbox.replaceWith(newCheckbox);
	}

	for (const select of HTMLElementfindAll(body, 'table span[class*=selected-value]')) {
		const lastChild = select.parentElement?.lastElementChild;
		if (lastChild === select) continue;
		select.textContent = select.textContent + ', ';
	}

	for (const a of HTMLElementfindAll(body, 'a[href]') as HTMLAnchorElement[]) {
		// Strip URLs which aren't valid, changing them to normal text.
		if (!/^(https?:\/\/|www\.)/.test(a.href)) {
			const strippedURL = createSpan();
			strippedURL.textContent = a.textContent ?? '';
			a.replaceWith(strippedURL);
		}
	}
}

function replaceNestedTags(body: HTMLElement, tag: 'strong' | 'em') {
	for (const el of HTMLElementfindAll(body, tag)) {
		if (!el.parentElement || el.parentElement.tagName === tag.toUpperCase()) {
			continue;
		}
		let firstNested = el.querySelector(tag);
		while (firstNested) {
			hoistChildren(firstNested);
			firstNested = el.querySelector(tag);
		}
	}
}

function splitBrsInFormatting(htmlString: string, tag: 'strong' | 'em') {
	const tags = htmlString.match(new RegExp(`<${tag}>(.|\n)*</${tag}>`));
	if (!tags) return;
	for (let tag of tags.filter((tag) => tag.includes('<br />'))) {
		htmlString = htmlString.replace(
			tag,
			tag.split('<br />').join(`</${tag}><br /><${tag}>`)
		);
	}
}

function replaceTableOfContents(body: HTMLElement) {
	const tocLinks = HTMLElementfindAll(body, 'a[href*=\\#]') as HTMLAnchorElement[];
	for (const link of tocLinks) {
		if (link.getAttribute('href')?.startsWith('#')) {
			link.setAttribute('href', '#' + link.textContent);
		}
	}
}

function encodeNewlinesToBr(body: HTMLElement) {
	body.innerHTML = body.innerHTML.replace(/\n/g, '<br />');
	// Since <br /> is ignored in codeblocks, we replace with newlines
	for (const block of HTMLElementfindAll(body, 'code')) {
		for (const br of HTMLElementfindAll(block, 'br')) {
			br.replaceWith('\n');
		}
	}
}

function stripLinkFormatting(body: HTMLElement) {
	for (const link of HTMLElementfindAll(body, 'link')) {
		link.innerText = link.textContent ?? '';
	}
}

function fixNotionDates(body: HTMLElement) {
	// Notion dates always start with @
	for (const time of HTMLElementfindAll(body, 'time')) {
		time.textContent = time.textContent?.replace(/@/g, '') ?? '';
	}
}

const fontSizeToHeadings: Record<string, 'h1' | 'h2' | 'h3'> = {
	'1.875em': 'h1',
	'1.5em': 'h2',
	'1.25em': 'h3',
};

function fixToggleHeadings(body: HTMLElement) {
	const toggleHeadings = HTMLElementfindAll(body, 'summary');
	for (const heading of toggleHeadings) {
		const style = heading.getAttribute('style');
		if (!style) continue;

		for (const key of Object.keys(fontSizeToHeadings)) {
			if (style.includes(key)) {
				heading.replaceWith(createEl(fontSizeToHeadings[key], { text: heading.textContent ?? '' }));
				break;
			}
		}
	}
}

function replaceElementsWithChildren(body: HTMLElement, selector: string) {
	let els = HTMLElementfindAll(body, selector);
	for (const el of els) {
		hoistChildren(el);
	}
}

function fixNotionLists(body: HTMLElement, tagName: 'ul' | 'ol') {
	// Notion creates each list item within its own <ol> or <ul>, messing up newlines in the converted Markdown. 
	// Iterate all adjacent <ul>s or <ol>s and replace each string of adjacent lists with a single <ul> or <ol>.
	for (const htmlList of HTMLElementfindAll(body, tagName)) {
		const htmlLists: HTMLElement[] = [];
		const listItems: HTMLElement[] = [];
		let nextAdjacentList: HTMLElement = htmlList;

		while (nextAdjacentList.tagName === tagName.toUpperCase()) {
			htmlLists.push(nextAdjacentList);
			for (let i = 0; i < nextAdjacentList.children.length; i++) {
				listItems.push(nextAdjacentList.children[i] as HTMLElement);
			}
			// classes are always "to-do-list, bulleted-list, or numbered-list"
			if (!nextAdjacentList.nextElementSibling || nextAdjacentList.getAttribute('class') !== nextAdjacentList.nextElementSibling.getAttribute('class')) break;
			nextAdjacentList = nextAdjacentList.nextElementSibling as HTMLElement;
		}

		const joinedList = createEl(tagName);
		for (const li of listItems) {
			joinedList.appendChild(li);
		}

		htmlLists[0].replaceWith(joinedList);
		htmlLists.slice(1).forEach(htmlList => htmlList.remove());
	}
}

function addCheckboxes(body: HTMLElement) {
	for (let checkboxEl of HTMLElementfindAll(body, '.checkbox.checkbox-on')) {
		checkboxEl.replaceWith('[x] ');
	}
	for (let checkboxEl of HTMLElementfindAll(body, '.checkbox.checkbox-off')) {
		checkboxEl.replaceWith('[ ] ');
	}
}

function convertHtmlLinksToURLs(content: HTMLElement) {
	const links = HTMLElementfindAll(content, 'a') as HTMLAnchorElement[];

	if (links.length === 0) return content;
	for (const link of links) {
		const span = createSpan();
		span.textContent = link.getAttribute('href') ?? '';
		link.replaceWith(span);
	}
}

function convertLinksToObsidian(info: NotionResolverInfo, notionLinks: NotionLink[], embedAttachments: boolean) {
	for (let link of notionLinks) {
		let obsidianLink = createSpan();
		let linkContent: string;

		switch (link.type) {
			case 'relation':
				const linkInfo = info.idsToFileInfo[link.id];
				if (!linkInfo) {
					console.warn('missing relation data for id: ' + link.id);
					const { basename } = parseFilePath(
						decodeURI(link.a.getAttribute('href') ?? '')
					);

					linkContent = `[[${stripNotionId(basename)}]]`;
				}
				else {
					const isInTable = link.a.closest('table');
					linkContent = `[[${linkInfo.fullLinkPathNeeded
						? `${info.getPathForFile(linkInfo)}${linkInfo.title}${isInTable ? '\u005C' : ''}|${linkInfo.title}`
						: linkInfo.title
					}]]`;
				}
				break;
			case 'attachment':
				const attachmentInfo = info.pathsToAttachmentInfo[link.path];
				if (!attachmentInfo) {
					console.warn('missing attachment data for: ' + link.path);
					continue;
				}
				linkContent = `${embedAttachments ? '!' : ''}[[${attachmentInfo.fullLinkPathNeeded
					? attachmentInfo.targetParentFolder +
						attachmentInfo.nameWithExtension +
						'|' +
						attachmentInfo.nameWithExtension
					: attachmentInfo.nameWithExtension
				}]]`;
				break;
		}

		obsidianLink.textContent = linkContent;
		link.a.replaceWith(obsidianLink);
	}
}

function cleanInvalidDOM(body: HTMLElement) {
	for (const ele of HTMLElementfindAll(body, 'script[src]')) {
		ele.remove();
	}
    for (const ele of HTMLElementfindAll(body, 'link[rel="stylesheet"]')) {
		ele.remove();
	}
}