import { parseFilePath } from '../../filesystem.js';
import { HTMLElementfindAll, parseHTML, createEl, createSpan, generateSiYuanID } from '../../util.js';
import { ZipEntryFile } from '../../zip.js';
import { type MarkdownInfo, type NotionLink, type NotionProperty, type NotionPropertyType, NotionResolverInfo } from './notion-types.js';
import {
	escapeHashtags,
	getNotionId,
	hoistChildren,
	stripNotionId,
	stripParentDirectories,
	toTimestamp,
	timestampIsPrueDate,
} from './notion-utils.js';

let lute = window.Lute.New();

function htmlToMarkdown(html: string): string {
    return lute.HTML2Md(html)
}

export async function readToMarkdown(info: NotionResolverInfo, file: ZipEntryFile): Promise<MarkdownInfo> {
	const text = await file.readText();

	const dom = parseHTML(text);
	// read the files etc.
	const body: HTMLElement = dom.querySelector('div[class=page-body]');

	if (body === null) {
		throw new Error('page body was not found');
	}

	// 由于 database 处理需要靠 <a href> 来构建关联关系，所以需要在转化链接之前完成
	let attributeViews = getDatabases(info, dom);

	// 将页面内所有的 a 标签转换为 siyuan 的双链指向
	const notionLinks = getNotionLinks(info, body);
	convertLinksToSiYuan(info, notionLinks);

	let frontMatter: MarkdownInfo['attrs'] = {};

	const rawProperties = dom.querySelector('table[class=properties] > tbody') as HTMLTableSectionElement | undefined;
	if (rawProperties) {
		const propertyLinks = getNotionLinks(info, rawProperties);
		convertLinksToSiYuan(info, propertyLinks);
		// YAML only takes raw URLS
		convertHtmlLinksToURLs(rawProperties);

		for (let row of Array.from(rawProperties.rows)) {
			const property = parseProperty(row);
			if (property) {
				property.title = property.title.trim().replace(/ /g, '-');
				if (property.title == 'Tags') {
					property.title = 'tags';
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

	// 将 dom 中 code 标签的 class 转换为小写
	// 样例 <code class="language-Mermaid"> 转换为 <code class="language-mermaid">

	dom.querySelectorAll('code[class^=language-]').forEach(codeNode => {
		codeNode.className = codeNode.className.toLowerCase();
	});

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

	// 替换 markdown 中的 database
	markdownBody = markdownBody.replace(/\[:av:(.*?):\]/g, (_, avID) => {
		return `<div data-type="NodeAttributeView" data-av-id="${avID}" data-av-type="table"></div>`;
	});

	return {
		'content': markdownBody.trim(),
		'attrs': frontMatter,
		'attributeViews': attributeViews,
	}
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

function parseProperty(property: HTMLTableRowElement): {content: string; title: string;} | undefined {
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

	let content: string = '';

	switch (type) {
		case 'checkbox':
			// checkbox-on: checked, checkbox-off: unchecked.
			content = String(body.innerHTML.includes('checkbox-on'));
			break;
		case 'number':
			const numberContent = Number(body.textContent);
			if (isNaN(numberContent)) return;
			content = String(numberContent);
			break;
		case 'date':
			fixNotionDates(body);
			content = body.querySelector('time')?.textContent || '';
			break;
		case 'list':
			const children = body.children;
			const childList: string[] = [];
			for (let i = 0; i < children.length; i++) {
				const itemContent = children.item(i)?.textContent;
				if (!itemContent) continue;
				childList.push(itemContent);
			}
			content = childList.join('\n');
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
			let link_type: NotionLink['type'] = 'attachment';
			if (/(\.png|\.jpg|\.webp|\.gif|\.bmp|\.jpeg)\!?\S*$/i.test(decodedURI)) {
				link_type = 'image'
			}
			links.push({
				type: link_type,
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

function convertLinksToSiYuan(info: NotionResolverInfo, notionLinks: NotionLink[]) {
	for (let link of notionLinks) {
		let siyuanLink = createSpan();
		let linkContent: string;

		switch (link.type) {
			case 'relation':
				const linkInfo = info.idsToFileInfo[link.id];
				if (linkInfo && linkInfo.blockID !== '') {
					linkContent = `((${linkInfo.blockID} '${linkInfo.title}'))`;
				} else {
					console.warn('missing relation data for id: ' + link.id);
					const { basename } = parseFilePath(
						decodeURI(link.a.getAttribute('href') ?? '')
					);
					linkContent = `[[${stripNotionId(basename)}]]`;
				}
				break;
			case 'attachment':
				let attachmentInfo = info.pathsToAttachmentInfo[link.path];
				if (!attachmentInfo) {
					console.warn('missing attachment data for: ' + link.path);
					continue;
				}
				linkContent = `[${attachmentInfo.nameWithExtension}](${attachmentInfo.pathInSiYuanMd})`;
				break;
			case 'image':
				let imageInfo = info.pathsToAttachmentInfo[link.path];
				if (!imageInfo) {
					console.warn('missing image file for: ' + link.path);
					continue;
				}
				linkContent = `![${imageInfo.nameWithExtension}](${imageInfo.pathInSiYuanMd})`;
				break;
		}

		siyuanLink.textContent = linkContent;
		link.a.replaceWith(siyuanLink);
	}
}

// cleanInvalidDOM 清除会导致 siyuan lute 报错的 dom 结构
function cleanInvalidDOM(body: HTMLElement) {
	for (const ele of HTMLElementfindAll(body, 'script[src]')) {
		ele.remove();
	}
    for (const ele of HTMLElementfindAll(body, 'link[rel="stylesheet"]')) {
		ele.remove();
	}
}

// generateColumnKey 根据所给的信息生成列
function generateColumnKey(name: string, colType: string, options: any[]) {
	return {
		"id": generateSiYuanID(),
		"name": name,
		"type": colType,
		"icon": "",
		"numberFormat": "",
		"template": "",
		"options": options,
	}
}

// getDatabases 将 notion 中的 database 转化为 siyuan 中的 database
// 并将 dom 中的 database 转为类似于 [:av:20240902133057-ioqa2mz:] 的占位，方便后续处理
function getDatabases(info: NotionResolverInfo, body: HTMLElement) {
	let tableInfos = [];
	// 如果没有 table 则直接返回
	const hasTable = Boolean(body.querySelector('table[class="collection-content"]'));
	if (!hasTable) {
		return []
	}
	// 检查是否为页面内嵌 database
	const isEmbedTable = Boolean(body.querySelector('div[class="collection-content"]'));
	if (isEmbedTable) {
		tableInfos = Array.from(body.querySelectorAll('div[class="collection-content"]')).map((divNode: HTMLElement) => {
			return {
				title: (divNode.querySelector('.collection-title') as HTMLElement)?.innerText.trim() || '',
				tableNode: (divNode.querySelector('table[class="collection-content"]') as HTMLElement),
			}
		})
	} else {
		tableInfos = [{
			title: (body.querySelector('.page-title') as HTMLElement)?.innerText.trim() || '',
			tableNode: (body.querySelector('table[class="collection-content"]') as HTMLElement),
		}]
	}
	let tables = tableInfos.map(tableInfo => {
		let tableNode: HTMLElement = tableInfo.tableNode;
		let cols = Array.from(tableNode.querySelectorAll('thead > tr > th')).map((x: HTMLElement) => {
			return {
				type: x.querySelector('span > svg').classList[0],
				name: x.innerText.trim(),
				selectValues: new Set(),
				values: [],
			}
		})
		let priKeyIndex = 0; // 主键所在的列 index
		for (const colIndex of cols.keys()) {
			if (cols[colIndex].type === 'typesTitle') {
				priKeyIndex = colIndex;
				break
			}
		}
		Array.from(tableNode.querySelectorAll('tbody > tr')).forEach((trNode: HTMLElement) => {
			const rowNotionID = getNotionId(trNode.querySelectorAll('td')[priKeyIndex].querySelector('a').href);
			const rowid = info.idsToFileInfo[rowNotionID]?.blockID || generateSiYuanID();
			const hasRelBlock = Boolean(info.idsToFileInfo[rowNotionID] && info.idsToFileInfo[rowNotionID].blockID !== ''); // 是否有相关联的 block
			Array.from(trNode.querySelectorAll('td')).forEach((tdNode: HTMLElement, colIndex: number) => {
				let baseColValue = {
					rowid: rowid,
					hasRelBlock: hasRelBlock,
				}
				if (cols[colIndex].type === 'typesTitle') {
					cols[colIndex].values.push({
						...baseColValue,
						value: tdNode.querySelector('a').innerText.trim()
					})
				} else if (cols[colIndex].type === 'typesDate') {
					const times = tdNode.innerText.trim().replace('@', '').split('→').map(z => {
						return z.trim();
					}).filter(Boolean)
					cols[colIndex].values.push({
						...baseColValue,
						value: times
					})
				} else if (['typesSelect', 'typesMultipleSelect'].includes(cols[colIndex].type)) {
					let opts = Array.from(tdNode.querySelectorAll('span.selected-value')).map((selectSpan: HTMLElement) => {
						const opt = selectSpan.innerText.trim();
						cols[colIndex].selectValues.add(opt);
						return opt;
					});
					cols[colIndex].values.push({
						...baseColValue,
						value: opts
					})
				} else if (cols[colIndex].type === 'typesCheckbox') {
					cols[colIndex].values.push({
						...baseColValue,
						value: Boolean(tdNode.querySelector('div.checkbox-on'))
					})
				} else {
					cols[colIndex].values.push({
						...baseColValue,
						value: tdNode.innerText.trim(),
					});
				}
			})
		});
		return {
			title: tableInfo.title,
			cols: cols,
		}
	})
	console.log(tables)
	let avs = tables.map(table => {
		// 构造出所有的数据
		let keyValues = [];
		let rowIds = [];
		for (const col of table.cols) {
			let colType = 'text';
			switch (col.type) {
				case 'typesTitle':
					colType = 'block';
					break;
				case 'typesDate':
					colType = 'date';
					break;
				case 'typesSelect':
					colType = 'select';
					break;
				case 'typesMultipleSelect':
					colType = 'mSelect';
					break;
				case 'typesCheckbox':
					colType = 'checkbox'
					break;
			}
			let keyValue = {
				key: {},
				values: []
			}
			if (colType === 'date') {
				keyValue.key = generateColumnKey(`${col.name}`, colType, [])
				keyValue.values = col.values.filter(v => {return Boolean(v.value.length)}).map((x) => {
					// 排除掉空数组，剩余的可构造
					const times = x.value.map(toTimestamp)
					const value = {
						id: generateSiYuanID(),
						keyID: keyValue.key['id'],
						blockID: x.rowid,
						type: colType,
						createdAt: Date.now(),
						updatedAt: Date.now(),
						date: {
							content: times[0],
							isNotEmpty: true,
							hasEndDate: false,
							isNotTime: timestampIsPrueDate(times[0]),
							content2: 0,
							isNotEmpty2: false,
							formattedContent: ""
						}
					}
					if (times.length === 2) {
						value.date.hasEndDate = true;
						value.date.content2 = times[1];
						value.date.isNotEmpty2 = true;
					}
					return value;
				})
			} else if (['select', 'mSelect'].includes(colType)) {
				let opts = new Map()
				for (const [i, x] of Array.from(col.selectValues).entries()) {
					opts.set(x, `${i+1}`)
				}
				keyValue.key = generateColumnKey(`${col.name}`, colType, Array.from(opts, ([name, color]) => ({ name, color })));
				keyValue.values = col.values.filter(v => {return Boolean(v.value.length)}).map((x) => {
					return {
						"id": generateSiYuanID(),
						"keyID": keyValue.key['id'],
						"blockID": x.rowid,
						"type": colType,
						"createdAt": Date.now(),
						"updatedAt": Date.now(),
						"mSelect": x.value.map(v => {
							return {
								content: v,
								color: opts.get(v),
							}
						})
					}
				})
			} else if (colType === 'block') {
				keyValue.key = generateColumnKey(`${col.name}`, colType, [])
				keyValue.values = col.values.map(x => {
					rowIds.push(x.rowid)
					return {
						"id": generateSiYuanID(),
						"keyID": keyValue.key['id'],
						"blockID": x.rowid,
						"type": colType,
						"isDetached": !x.hasRelBlock,
						"createdAt": Date.now(),
						"updatedAt": Date.now(),
						"block": {
							"id": x.rowid,
							"content": x.value,
							"created": Date.now(),
							"updated": Date.now(),
						}
					}
				})
			} else if (colType === 'checkbox') {
				keyValue.key = generateColumnKey(`${col.name}`, colType, [])
				keyValue.values = col.values.filter(v => {return v.value}).map(x => {
					return {
						"id": generateSiYuanID(),
						"keyID": keyValue.key['id'],
						"blockID": x.rowid,
						"type": colType,
						"createdAt": Date.now(),
						"updatedAt": Date.now(),
						"checkbox": {
							"checked": x.value,
						}
					}
				})
			} else {
				keyValue.key = generateColumnKey(`${col.name}`, 'text', [])
				keyValue.values = col.values.filter(v => {return Boolean(v.value)}).map((x) => {
					return {
						"id": generateSiYuanID(),
						"keyID": keyValue.key['id'],
						"blockID": x.rowid,
						"type": 'text',
						"createdAt": Date.now(),
						"updatedAt": Date.now(),
						"text": {
							"content": x.value,
						}
					}
				})
			}
			keyValues.push(keyValue)
		}
		// 构建成 siyuan 的数据库
		const avID = generateSiYuanID();
		const avViewID = generateSiYuanID();
		const avTableID = generateSiYuanID();
		let avData = {
			"spec": 0,
			"id": avID,
			"name": table.title,
			"keyValues": keyValues,
			"keyIDs": null,
			"viewID": avViewID,
			"views": [
				{
					"id": avViewID,
					"icon": "",
					"name": "表格",
					"hideAttrViewName": false,
					"type": "table",
					"table": {
						"spec": 0,
						"id": avTableID,
						"columns": keyValues.map((x) => {
							return {
								"id": x.key.id,
								"wrap": false,
								"hidden": false,
								"pin": false,
								"width": ""
							}
						}),
						"rowIds": rowIds,
						"filters": [],
						"sorts": [],
						"pageSize": 50
					}
				}
			]
		};
		return avData;
	});
	console.log(avs)
	// 将 dom 中的 database 转为类似于 [:av:20240902133057-ioqa2mz:] 的占位，方便后续处理
	let collectionContentSelector = 'table[class="collection-content"]';
	if (isEmbedTable) {
		collectionContentSelector = 'div[class="collection-content"]'
	}
	body.querySelectorAll(collectionContentSelector).forEach((table, i) => {
		// 创建新的 <div> 元素
		var newDiv = document.createElement('div');
		newDiv.textContent = `[:av:${avs[i].id}:]`;
		
		// 替换掉原来的 <table> 元素
		table.parentNode.replaceChild(newDiv, table);
	});
	return avs;
}