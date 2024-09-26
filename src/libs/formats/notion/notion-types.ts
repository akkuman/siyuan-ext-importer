export type NotionPropertyType =
	| 'text'
	| 'number'
	| 'select'
	| 'multi_select'
	| 'status'
	| 'date'
	| 'person'
	| 'file'
	| 'checkbox'
	| 'url'
	| 'email'
	| 'phone_number'
	| 'formula'
	| 'relation'
	| 'rollup'
	| 'created_time'
	| 'created_by'
	| 'last_edited_time'
	| 'last_edited_by'
	| 'auto_increment_id';

export type NotionProperty = {
	type: 'text' | 'date' | 'number' | 'list' | 'checkbox';
	title: string;
	notionType: NotionPropertyType;
	links: NotionLink[];
	body: HTMLTableCellElement;
};

export type MarkdownInfo = {
	content: string;
	// 在 siyuan 中的块属性一般是给插件使用，一般情况下不需要使用
	// 在 notion 中只有在 database 中的文档才有属性，已经将 database 转为了表格，不需要再对文档的块属性做设置了
	attrs: { [key: string]: string };
	// 用来存放已经转换为 siyuan 的 database 数据
	attributeViews: any[];
}

export type NotionLink =
	{
		type: 'relation';
		id: string;
		a: HTMLAnchorElement;
	}
	|
	{
		type: 'attachment';
		path: string;
		a: HTMLAnchorElement;
	}
	|
	{
		type: 'image';
		path: string;
		a: HTMLAnchorElement;
	};


export interface NotionFileInfo {
	title: string;
	parentIds: string[];
	blockID: string;
	path: string;
	ctime: Date | null;
	mtime: Date | null;
	hasContent: Boolean; // 文档是否有内容
}

export interface NotionAttachmentInfo {
	path: string;
	parentIds: string[];
	nameWithExtension: string;
	targetParentFolder: string;
	// 保存文件的真实地址
	pathInSiYuanFs: string;
	// 展示在文档中的地址
	pathInSiYuanMd: string;
}

export class NotionResolverInfo {
	idsToFileInfo: Record<string, NotionFileInfo> = {};
	pathsToAttachmentInfo: Record<string, NotionAttachmentInfo> = {};
	attachmentPath: string;
	singleLineBreaks: boolean;

	constructor(attachmentPath: string, singleLineBreaks: boolean) {
		this.attachmentPath = attachmentPath;
		this.singleLineBreaks = singleLineBreaks;
	}

	getPathForFile(fileInfo: NotionFileInfo | NotionAttachmentInfo) {
		let { idsToFileInfo } = this;
		const pathNames = fileInfo.path.split('/');
		return fileInfo.parentIds
			.map((parentId) =>
				idsToFileInfo[parentId]?.title ??
				pathNames.find((pathSegment) => pathSegment.includes(parentId))?.replace(` ${parentId}`, '')
			)
			// Notion inline databases have no .html file and aren't a note, so we just filter them out of the folder structure.
			.filter((parentId) => parentId)
			// Folder names can't end in a dot or a space
			.map((folder) => folder.replace(/[\. ]+$/, ''))
			.join('/') + '/';
	}
}
