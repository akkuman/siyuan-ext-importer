import { parseFilePath } from '../../filesystem.js';

export const stripNotionId = (id: string) => {
	return id.replace(/-/g, '').replace(/[ -]?[a-f0-9]{32}(\.|$)/, '$1');
};

// Notion UUIDs come at the end of filenames/URL paths and are always 32 characters long.
export const getNotionId = (id: string) => {
	return id.replace(/-/g, '').match(/([a-f0-9]{32})(\?|\.|$)/)?.[1];
};

export const parseParentIds = (filename: string) => {
	const { parent } = parseFilePath(filename);
	return parent
		.split('/')
		.map((parentNote) => getNotionId(parentNote))
		.filter((id) => id) as string[];
};

export function stripParentDirectories(relativeURI: string) {
	return relativeURI.replace(/^(\.\.\/)+/, '');
}

export function escapeHashtags(body: string) {
	const tagExp = /#[a-z0-9\-]+/gi;

	if (!tagExp.test(body)) return body;
	const lines = body.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const hashtags = lines[i].match(tagExp);
		if (!hashtags) continue;
		let newLine = lines[i];
		for (let hashtag of hashtags) {
			// skipping any internal links [[ # ]], URLS [ # ]() or []( # ), or already escaped hashtags \#, replace all tag-like things #<word> in the document with \#<word>. Useful for programs (like Notion) that don't support #<word> tags.
			const hashtagInLink = new RegExp(
				`\\[\\[[^\\]]*${hashtag}[^\\]]*\\]\\]|\\[[^\\]]*${hashtag}[^\\]]*\\]\\([^\\)]*\\)|\\[[^\\]]*\\]\\([^\\)]*${hashtag}[^\\)]*\\)|\\\\${hashtag}`
			);

			if (hashtagInLink.test(newLine)) continue;
			newLine = newLine.replace(hashtag, '\\' + hashtag);
		}
		lines[i] = newLine;
	}
	body = lines.join('\n');
	return body;
}

/**
 * Hoists all child nodes of this node to where this node used to be,
 * removing this node altogether from the DOM.
 */
export function hoistChildren(el: ChildNode) {
	el.replaceWith(...Array.from(el.childNodes));
}

// 将 2024/07/22 或者 2024/07/22 8:15 这种时间转换为时间戳
export function toTimestamp(dateString: string): number {
	// 创建 Date 对象时，如果时间部分缺失，JavaScript 会默认设置为 00:00:00
	const date = new Date(dateString);

	// 如果 date 是无效的时间，返回 NaN
	if (isNaN(date.getTime())) {
		return 0;
	}

	// 返回时间戳，单位为毫秒
	return date.getTime();
}

// timestampIsPrueDate 获取时间戳是否为日期（不含时间）
export function timestampIsPrueDate(timestamp: number) {
	const date = new Date(timestamp);
	return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}
