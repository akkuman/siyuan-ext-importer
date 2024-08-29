<script lang="ts">
	import 'virtual:uno.css'; // 这一行必须，https://unocss.dev/integrations/vite
	import { KCol, KRow } from '@ikun-ui/grid';
	import { KSelect } from '@ikun-ui/select';
	import { KDivider } from '@ikun-ui/divider';
    import { KButton } from '@ikun-ui/button';
    import { PickedFile, WebPickedFile } from './libs/filesystem';
    import { NotionResolverInfo } from './libs/formats/notion/notion-types';
    import { readZip, ZipEntryFile } from './libs/zip';
    import { getNotionId } from './libs/formats/notion/notion-utils';
    import { parseFileInfo } from './libs/formats/notion/parse-info';
	import { Client } from '@siyuan-community/siyuan-sdk';
    import { onMount } from 'svelte';
    import { readToMarkdown } from './libs/formats/notion/convert-to-md';

	const client = new Client();

	let notebooks: { label: string; value: any; }[] = [];
	let currentNotebook: any = { name: '' };

	// 用户指南不应该作为可以写入的笔记本
	const hiddenNotebook: Set<string> = new Set(["思源笔记用户指南", "SiYuan User Guide"]);

	onMount(async () => {
		const res = await client.lsNotebooks();
		const data = res.data;
		const nbs = data.notebooks ?? [];
		notebooks = nbs.filter((notebook) => !notebook.closed && !hiddenNotebook.has(notebook.name)).map(((value: any) => {
			return { label: value.name, value: value };
		}));
	});

	const onNotebookChange = async function (e) {
		currentNotebook = e.detail.value
	}

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

	async function onImport(e) {
		// Note that `files` is of type `FileList`, not an Array:
		// https://developer.mozilla.org/en-US/docs/Web/API/FileList
		console.log(files);

		for (const file of files) {
			console.log(`${file.name}: ${file.size} bytes`);
			const info = new NotionResolverInfo('', false);
			let import_files = [new WebPickedFile(file)];
			let total = 0;
			console.log('Looking for files to import');
			await processZips(import_files, async (file) => {
				try {
					await parseFileInfo(info, file);
					total = Object.keys(info.idsToFileInfo).length + Object.keys(info.pathsToAttachmentInfo).length;
				}
				catch (e) {
					console.log('Import skipped', file.fullpath, e)
				}
			});
			console.log(info)
			let current = 0;
			// return;
			console.log('Starting import');
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

						const markdownBody = await readToMarkdown(info, file);
						const path = `${info.getPathForFile(fileInfo)}${fileInfo.title}`;
						await client.createDocWithMd({
							markdown: markdownBody,
							notebook: currentNotebook.id,
							path: path,
						})

					} else {
						const attachmentInfo = info.pathsToAttachmentInfo[file.filepath];
						if (!attachmentInfo) {
							throw new Error('attachment info not found for ' + file.filepath);
						}

						console.log(`Importing attachment ${file.name}`);

						const data = await file.read();
						await client.upload({
							assetsDirPath: "/assets/",
							files: [new File([data], file.name)],
						})
					}
					console.log(`progress ${current}/${total}`)
				}
				catch (e) {
					console.log(file.fullpath, e)
				}
			});
		}
	}

	export let app;
</script>


<div>
	<KRow>
		<KCol span={14}>
			<KRow><span>文件格式</span></KRow>
			<KRow><span>要被导入的文件格式</span></KRow>
		</KCol>
		<KCol span={10}>
			<KSelect
				value={currentNotebook.name}
				dataList={notebooks}
				labelKey="label"
				valueKey="value"
				key="label"
				cls="float-right"
				on:updateValue={onNotebookChange}
			></KSelect>
		</KCol>
	</KRow>

	<KDivider></KDivider>
	
	<KRow>
		<KCol span={24}><div class="rounded h-36px bg-orange-200" />
			<input bind:files type="file" />
		</KCol>
	</KRow>

	<KDivider></KDivider>
	
	<KRow>
		<KCol span={24}>
			<KButton type="primary" cls="mx-2 float-right" on:click={onImport}>导入</KButton>
		</KCol>
	</KRow>
</div>
