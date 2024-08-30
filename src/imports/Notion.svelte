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

    let attrNameMappingText: string = '';

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

    function parseAttrNameMappingText() {
        // 属性名翻译映射表
        // siyuan属性名仅支持英文字母和阿拉伯数字，故需要映射
        let attrNameMapping: { [key: string]: string} = {
            // '公司': 'company',
            // '起止时间': 'start-end-time',
        };
        if (attrNameMappingText === '') {
            return attrNameMapping;
        }
        attrNameMappingText.split('\n').map((value) => {
            return value.trim().split(':').map((x) => {
                return x.trim();
            })
        }).forEach((value) => {
            if (value.length !== 2 || value[0].length === 0) {
                showMessage('格式不符合要求，请重新输入', -1, 'error');
                throw new Error('格式不符合要求，请重新输入');
            }
            const v = value[1].replace(/ /g, '-')
            if (!/^[a-zA-Z0-9\-]*$/.test(v)) {
                showMessage('格式不符合要求，请重新输入', -1, 'error');
                throw new Error('格式不符合要求，请重新输入');
            }
            attrNameMapping[value[0]] = v;
        })
        return attrNameMapping;
    }

	async function onClickImport(e) {
        // 点击导入时触发事件
        clickImportLoading = true;
        try {
            let attrNameMapping = parseAttrNameMappingText();
            // Note that `files` is of type `FileList`, not an Array:
            // https://developer.mozilla.org/en-US/docs/Web/API/FileList
            // 目前的情况下只可能有一个
            for (const file of files) {
                console.log(`${file.name}: ${file.size} bytes`);
                const info = new NotionResolverInfo('', false);
                let import_files = [new WebPickedFile(file)];
                console.log('Looking for files to import');
                showMessage('开始进行导入前的文件搜集和校验', 1000*30, 'info')
                await processZips(import_files, async (file) => {
                    try {
                        await parseFileInfo(info, file);
                        total = Object.keys(info.idsToFileInfo).length + Object.keys(info.pathsToAttachmentInfo).length;
                    }
                    catch (e) {
                        console.log('文件搜集 Import skipped', file.fullpath, e)
                    }
                });
                // 不符合要求的文档属性名
                let invalidAttrNames: Set<string> = new Set<string>();
                await processZips(import_files, async (file) => {
                    try {
                        if (file.extension === 'html') {
                            const markdownInfo = await readToMarkdown(info, file);
                            Object.entries(markdownInfo.attrs).filter(([key, _]) => {
                                return !attrNameMapping.hasOwnProperty(key) && !/^[a-zA-Z0-9\-]*$/.test(key);
                            }).forEach((value) => {
                                invalidAttrNames.add(value[0])
                            })
                        }
                    } catch (e) {
                        console.log('文件校验 Import skipped', file.fullpath, e)
                    }
                })
                // 判断是否含有非法属性名，如果存在，则直接告知用户需要输入
                if (invalidAttrNames.size > 0) {
                    attrNameMappingText = Array.from(invalidAttrNames).map((value) => {
                        return `${value}:`
                    }).join('\n');
                    showMessage('属性名仅支持英文字母和阿拉伯数字，请在文本框中填入这些属性名的映射，样例为 “公司:company”，冒号后面留空代表跳过', -1, 'error');
                    return;
                }
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
                            const resCreateDocWithMd = await client.createDocWithMd({
                                markdown: markdownInfo.content,
                                notebook: currentNotebook.id,
                                path: path,
                            })
                            if (resCreateDocWithMd.code !== 0) {
                                console.error(resCreateDocWithMd.msg);
                                return;
                            }
                            const resSetBlockAttrs = await client.setBlockAttrs({
                                'id': resCreateDocWithMd.data,
                                'attrs': Object.fromEntries(
                                    // 给所有的属性键加上特定前缀
                                    // 参见：https://docs.siyuan-note.club/zh-Hans/reference/api/kernel/#%E8%AE%BE%E7%BD%AE%E5%9D%97%E5%B1%9E%E6%80%A7
                                    Object.entries(markdownInfo.attrs).map(([key, value]) => {
                                        // 使用属性名翻译映射表来处理
                                        key = attrNameMapping[key] || key;
                                        return [key, value];
                                    }).filter(([key, _]) => {
                                        // 属性名仅支持英文字母和阿拉伯数字和 “-”
                                        // 此处需要做检测，去除掉不支持的属性名
                                        return /^[a-zA-Z0-9\-]*$/.test(key);
                                    }).map(([key, value]) => {
                                        if (!key.startsWith('custom-')) {
                                            return [`custom-${key}`, value];
                                        }
                                        return [key, value];
                                    })
                                ),
                            })
                            if (resSetBlockAttrs.code !== 0) {
                                console.error(resSetBlockAttrs.msg);
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

    function onAttrNameMappingTextInput(e) {
        attrNameMappingText = e.detail;
    }
</script>


<div>
	<KRow>
		<KCol span={24}><div class="rounded" />
			<FileInput bind:files accept_ext={['.zip']} />
		</KCol>
	</KRow>

	<KDivider />

    {#if attrNameMappingText.length !== 0 }
        <KInput
            placeholder="请输入映射，一行一个，冒号分割，比如 “公司:company”"
            on:input={onAttrNameMappingTextInput}
            type="textarea"
            rows={1}
            autosize={{
                minRows: 3,
                maxRows: 5
            }}
            value={attrNameMappingText}
            cls="mx-2 my-4"
        ></KInput>
        <KDivider />
    {/if}
	
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
