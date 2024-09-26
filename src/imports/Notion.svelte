<script lang="ts">
	import 'virtual:uno.css'; // 这一行必须，https://unocss.dev/integrations/vite
	import { KCol, KRow } from '@ikun-ui/grid';
	import { KDivider } from '@ikun-ui/divider';
    import { KButton } from '@ikun-ui/button';
    import { type PickedFile, WebPickedFile } from '../libs/filesystem';
    import { NotionResolverInfo } from '../libs/formats/notion/notion-types';
    import { readZip, ZipEntryFile } from '../libs/zip';
    import { getNotionId } from '../libs/formats/notion/notion-utils';
    import { parseFileInfo } from '../libs/formats/notion/parse-info';
	import { Client } from '@siyuan-community/siyuan-sdk';
    import { readToMarkdown } from '../libs/formats/notion/convert-to-md';
    import FileInput from '../FileInput.svelte';
    import { createEventDispatcher } from 'svelte';
    import Ikun from '../assets/ikun.svelte';
    import { showMessage } from 'siyuan';
    import { type NotionFileInfo } from '../libs/formats/notion/notion-types';

    const dispatch = createEventDispatcher();

    let current = 0;
    let total = 100;

    // 监听 current 和 total 的变化
    $: dispatch('progressChange', { current, total });

    const client = new Client();

    export let currentNotebook: any = { name: '' };

    export let pluginInstance;

    let clickImportLoading = false;

	async function processZips(files: PickedFile[], callback: (file: ZipEntryFile) => Promise<void>) {
		for (let zipFile of files) {
			try {
				await readZip(zipFile, async (_, entries) => {
					for (let entry of entries) {

						// throw an error for Notion Markdown exports
						if (entry.extension === 'md' && getNotionId(entry.name)) {
							console.log('Notion Markdown export detected. Please export Notion data to HTML instead.');
							throw new Error('Notion importer uses only HTML exports. Please use the correct format.');
						}

						// Skip databses in CSV format
						if (entry.extension === 'csv' && getNotionId(entry.name)) continue;

						// Skip summary files
						if (entry.name === 'index.html') continue;

						// Only recurse into zip files if they are at the root of the parent zip
						// because users can attach zip files to Notion, and they should be considered
						// attachment files.
						if (entry.extension === 'zip' && entry.parent === '') {
							try {
								await processZips([entry], callback);
							}
							catch (e) {
								console.log(entry.fullpath, e)
							}
						}
						else {
							await callback(entry);
						}
					}
				});
			}
			catch (e) {
				console.log(zipFile.fullpath)
			}
		}
	}

	let files;

	async function onClickImport(e) {
        // 点击导入时触发事件
        clickImportLoading = true;
        try {
            // Note that `files` is of type `FileList`, not an Array:
            // https://developer.mozilla.org/en-US/docs/Web/API/FileList
            // 目前的情况下只可能有一个
            for (const file of files) {
                console.log(`${file.name}: ${file.size} bytes`);
                const info = new NotionResolverInfo('', false);
                let import_files = [new WebPickedFile(file)];
                console.log('Looking for files to import');
                showMessage(pluginInstance.i18n.startCollectFilePreImport, 1000*30, 'info')
                total = 0;
                let importIsNotStarted = true;
                await processZips(import_files, async (file) => {
                    total += 1;
                    if (importIsNotStarted) {
                        dispatch('startImport');
                        console.log('Starting import');
                        importIsNotStarted = false;
                    }
                    try {
                        await parseFileInfo(info, file);
                    }
                    catch (e) {
                        console.log('文件搜集 Import skipped', file.fullpath, e)
                    }
                });
                total +=  Object.keys(info.idsToFileInfo).length
                showMessage(pluginInstance.i18n.startImport, 1000*15, 'info')
                console.log('Creating all document...')
                // 首先查找各个文档作为其他文档的parent出现了多少次
                // 如果不存在的则为叶子文档
                let parentCount: Map<string, number> = new Map();
                for (const fileInfo of Object.values(info.idsToFileInfo) as NotionFileInfo[]) {
                    fileInfo.parentIds.forEach(pid => {
                        parentCount.set(pid, (parentCount.get(pid) || 0)+1)
                    })
                }
                // 创建一个空文档先占位，获取到 blockid
                // 广度优先遍历（BFS）创建文档
                //   由于 createDocWithMd 对于相同路径的文档会创建两遍，如果先创建了较深路径的文档，
                //   则后续创建它的父级文档会出现重复名称的文档
                let depth = 0
                let docSeen = 0;
                while (true) {
                    for (const [notionID, fileInfo] of Object.entries(info.idsToFileInfo) as [string, NotionFileInfo][]) {
                        const hPath = info.getPathForFile(fileInfo)
                        let path = `${hPath}${fileInfo.title}`;
                        if (!path.startsWith('/')) {
                            path = '/' + path;
                        }
                        if (path.split('/').length === depth) {
                            current += 1;
                            docSeen += 1;
                            // 跳过空内容的叶子文档
                            if (!fileInfo.hasContent && !parentCount.get(notionID)) {
                                console.log(`"${path}"'s content is blank, create doc skipped`);
                                continue;
                            }
                            const payload = {
                                markdown: '',
                                notebook: currentNotebook.id,
                                path: path,
                            };
                            const resCreateDocWithMd = await client.createDocWithMd(payload);
                            if (resCreateDocWithMd.code !== 0) {
                                console.error(resCreateDocWithMd.msg);
                                continue;
                            }
                            info.idsToFileInfo[notionID].blockID = resCreateDocWithMd.data;
                        }
                    }
                    depth += 1;
                    if (docSeen === Object.keys(info.idsToFileInfo).length) {
                        break;
                    }
                }
                // 写入所有文档内容
                await processZips(import_files, async (file) => {
                    current++;
                    try {
                        if (file.extension === 'html') {
                            // 写入文档和 database
                            const id = getNotionId(file.name);
                            if (!id) {
                                throw new Error('ids not found for ' + file.filepath);
                            }
                            const fileInfo = info.idsToFileInfo[id];
                            if (!fileInfo) {
                                throw new Error('file info not found for ' + file.filepath);
                            }
                            const path = `${info.getPathForFile(fileInfo)}${fileInfo.title}`;
                            if (fileInfo.blockID === '') {
                                console.log(`"${path}"'s blockID is blank, write doc skipped`)
                                return;
                            }
                            // 处理读取 html
                            console.log(`Importing note ${fileInfo.title}`);
                            const markdownInfo = await readToMarkdown(info, file);
                            // 上传 siyuan database 文件
                            for (const av of markdownInfo.attributeViews) {
                                const avJSONString = JSON.stringify(av);
                                const blob = new Blob([avJSONString], { type: 'application/json' });
                                const resPutFile = await client.putFile({
                                    'file': new File([blob], 'data.json', { type: 'application/json' }),
                                    'path': `/data/storage/av/${av.id}.json`,
                                })
                                if (resPutFile.code !== 0) {
                                    console.log(`put attribute view failed: ${resPutFile.msg}`)
                                }
                            }
                            // 更新文档
                            const resUpdateBlock = await client.updateBlock({
                                data: markdownInfo.content,
                                dataType: 'markdown',
                                id: fileInfo.blockID,
                            })
                            if (resUpdateBlock.code !== 0) {
                                console.error(resUpdateBlock.msg);
                                return;
                            }
                        } else {
                            // 写入附件
                            const attachmentInfo = info.pathsToAttachmentInfo[file.filepath];
                            if (!attachmentInfo) {
                                throw new Error('attachment info not found for ' + file.filepath);
                            }

                            console.log(`Importing attachment ${file.name}`);

                            const data = await file.read();
                            const resPutFile = await client.putFile({
                                'file': new File([data], file.name),
                                'path': attachmentInfo.pathInSiYuanFs,
                            })
                            if (resPutFile.code !== 0) {
                                console.error(resPutFile.msg);
                                return;
                            }
                        }
                        console.log(`progress ${current}/${total}`)
                    }
                    catch (e) {
                        console.log(file.fullpath, e)
                    }
                });
            }
            showMessage(pluginInstance.i18n.importFinish, -1, 'info')
        } finally {
            clickImportLoading = false;
        }
	}
</script>


<div>
	<KRow>
		<KCol span={24}><div class="rounded" />
			<FileInput bind:files accept_ext={['.zip']} />
		</KCol>
	</KRow>

	<KDivider />
	
	<KRow>
		<KCol span={24}>
            <KButton type="primary" cls="mx-2 float-right" on:click={onClickImport} disabled={clickImportLoading}>
                {#if clickImportLoading}
                    <Ikun />
                {/if}
                {pluginInstance.i18n.import}
            </KButton>
		</KCol>
	</KRow>
</div>
