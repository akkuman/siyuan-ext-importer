<script lang="ts">
	import 'virtual:uno.css'; // 这一行必须，https://unocss.dev/integrations/vite
	import { KCol, KRow } from '@ikun-ui/grid';
	import { KDivider } from '@ikun-ui/divider';
    import { KButton } from '@ikun-ui/button';
    import { PickedFile, WebPickedFile } from '@/libs/filesystem';
    import { NotionResolverInfo } from '@/libs/formats/notion/notion-types';
    import { readZip, ZipEntryFile } from '@/libs/zip';
    import { getNotionId } from '@/libs/formats/notion/notion-utils';
    import { parseFileInfo } from '@/libs/formats/notion/parse-info';
	import { Client } from '@siyuan-community/siyuan-sdk';
    import { readToMarkdown } from '@/libs/formats/notion/convert-to-md';
    import FileInput from '@/FileInput.svelte';
    import { createEventDispatcher } from 'svelte';
    import { KInput } from '@ikun-ui/input';
    import Ikun from '@/assets/ikun.svelte';
    import { showMessage } from 'siyuan';

    const dispatch = createEventDispatcher();

    let current = 0;
    let total = 100;

    // 监听 current 和 total 的变化
    $: dispatch('progressChange', { current, total });

    const client = new Client();

    export let currentNotebook: any = { name: '' };

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
                showMessage('开始进行导入前的文件搜集', 1000*30, 'info')
                await processZips(import_files, async (file) => {
                    try {
                        await parseFileInfo(info, file);
                        total = Object.keys(info.idsToFileInfo).length + Object.keys(info.pathsToAttachmentInfo).length;
                    }
                    catch (e) {
                        console.log('文件搜集 Import skipped', file.fullpath, e)
                    }
                });
                dispatch('startImport');
                console.log('Starting import');
                showMessage('开始执行数据导入', 1000*15, 'info')
                await processZips(import_files, async (file) => {
                    current++;
                    try {
                        if (file.extension === 'html') {
                            const id = getNotionId(file.name);
                            if (!id) {
                                throw new Error('ids not found for ' + file.filepath);
                            }
                            const fileInfo = info.idsToFileInfo[id];
                            if (!fileInfo) {
                                throw new Error('file info not found for ' + file.filepath);
                            }

                            console.log(`Importing note ${fileInfo.title}`);

                            const markdownInfo = await readToMarkdown(info, file);
                            const path = `${info.getPathForFile(fileInfo)}${fileInfo.title}`;
                            if (markdownInfo.content === '') {
                                console.log(`"${path}"'s content is blank，import skipped`)
                                return;
                            }
                            const resCreateDocWithMd = await client.createDocWithMd({
                                markdown: markdownInfo.content,
                                notebook: currentNotebook.id,
                                path: path,
                            })
                            if (resCreateDocWithMd.code !== 0) {
                                console.error(resCreateDocWithMd.msg);
                                return;
                            }
                        } else {
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
            showMessage('导入数据完成', -1, 'info')
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
                导入
            </KButton>
		</KCol>
	</KRow>
</div>
