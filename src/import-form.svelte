<script lang="ts">
	import 'virtual:uno.css'; // 这一行必须，https://unocss.dev/integrations/vite
	import { KCol, KRow } from '@ikun-ui/grid';
	import { KSelect } from '@ikun-ui/select';
	import { KDivider } from '@ikun-ui/divider';

	let dataType = { label: 'Notion (.zip)', value: 'notion'};

	const dataTypeList = [
		{ label: 'Apple Notes', value: 'apple-notes'},
		{ label: 'Bear (.bear2bk)', value: 'bear'},
		{ label: 'Evernote (.enex)', value: 'evernote'},
		{ label: 'Google Keep (.zip/.json)', value: 'keep'},
		{ label: 'HTML (.html)', value: 'html'},
		{ label: 'Microsoft OneNote', value: 'onenote'},
		{ label: 'Notion (.zip)', value: 'notion'},
		{ label: 'Roam Research (.json)', value: 'roam-json'},
		{ label: 'Textbundle (.textbundle, .textpack)', value: 'textbundle'},
	];

	const onSelectDataType = (e) => {
		dataType = e.detail;
	};

	let value = '';
	const onSelect = (e) => {
		value = e.detail;
	};

	export let app;
</script>


<div class="b3-dialog__content">
	<KSelect {value} on:updateValue={onSelect} dataList={['Tiny', 'Small', 'Normal', 'Large', 'Huge']}
></KSelect>
	<KRow>
		<KCol span={12}>
			<KRow><span>文件格式</span></KRow>
			<KRow><span>要被导入的文件格式</span></KRow>
		</KCol>
		<KCol span={12} style>
			<!-- <KSelect value={dataType} dataList={dataTypeList} labelKey="label" valueKey="value" key="value" on:updateValue={onSelectDataType}
			></KSelect> -->
			<!-- <KSelect {value} {dataList} labelKey="label" valueKey="value" key="id" on:updateValue={onSelect}
></KSelect> -->
		</KCol>
	</KRow>
	<KDivider></KDivider>
	
	<KRow>
		<KCol span={24}><div class="rounded h-36px bg-orange-200" /></KCol>
	</KRow>
	
	<KRow>
		<KCol span={24}><div class="rounded h-36px bg-orange-200" /></KCol>
	</KRow>
</div>
