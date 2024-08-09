import { defineConfig, presetAttributify, presetIcons, presetUno } from 'unocss';
import { presetIkun, getCSSPreflights, getSafeList } from '@ikun-ui/preset';

export default defineConfig({
	presets: [presetUno(), presetAttributify(), presetIcons(), presetIkun()],
	safelist: [...getSafeList()],
	preflights: [
		{
			layer: 'base',
			getCSS: () => `:root {${getCSSPreflights()}}`
		}
	]
});
