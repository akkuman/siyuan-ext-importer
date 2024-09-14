<script lang="ts">
	import 'virtual:uno.css'; // 这一行必须，https://unocss.dev/integrations/vite
	import { KCol, KRow } from '@ikun-ui/grid';
	import { KSelect } from '@ikun-ui/select';
	import { KDivider } from '@ikun-ui/divider';
	import { KProgress } from '@ikun-ui/progress';
	import { Client } from '@siyuan-community/siyuan-sdk';
    import { onMount } from 'svelte';
    import Notion from '@/imports/Notion.svelte';

	const client = new Client();

	let notebooks: { label: string; value: any; }[] = [];
	let currentNotebook: any = { name: '' };
	let progressCurrent = 0;
    let progressTotal = 100;
	let showProgressBar = false;

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

	function handleProgressChange(event) {
        progressCurrent = event.detail.current;
        progressTotal = event.detail.total;
    }

	function handleStartImport(event) {
		showProgressBar = true;
	}

	export let pluginInstance;
</script>


<div>
	<KRow>
		<!-- <KCol span={14}>
			<KRow><span>文件格式</span></KRow>
			<KRow><span>要被导入的文件格式</span></KRow>
		</KCol> -->
		<KCol span={14}>
			<KRow><span>{pluginInstance.i18n.notebook}</span></KRow>
			<KRow><span>{pluginInstance.i18n.pleaseSelectNotebook}</span></KRow>
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

	<KDivider/>

	{#if showProgressBar}
		<KProgress percentage={Number((progressCurrent/progressTotal*100).toFixed(1))}></KProgress>
		<KDivider/>
	{/if}
	
	<Notion {currentNotebook} {pluginInstance} on:progressChange={handleProgressChange} on:startImport={handleStartImport} />
</div>
