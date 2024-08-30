import { stringify } from 'yaml'
import CryptoJS from 'crypto-js';

let illegalRe = /[\/\?<>\\:\*\|"]/g;
let controlRe = /[\x00-\x1f\x80-\x9f]/g;
let reservedRe = /^\.+$/;
let windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
let windowsTrailingRe = /[\. ]+$/;
let startsWithDotRe = /^\./; // Regular expression to match filenames starting with "."
let badLinkRe = /[\[\]#|^]/g; // Regular expression to match characters that interferes with links: [ ] # | ^

export let assetBaseDir = 'assets';


interface DomElementInfo {
    /**
     * The class to be assigned. Can be a space-separated string or an array of strings.
     */
    cls?: string | string[];
    /**
     * The textContent to be assigned.
     */
    text?: string | DocumentFragment;
    /**
     * HTML attributes to be added.
     */
    attr?: {
        [key: string]: string | number | boolean | null;
    };
    /**
     * HTML title (for hover tooltip).
     */
    title?: string;
    /**
     * The parent element to be assigned to.
     */
    parent?: Node;
    value?: string;
    type?: string;
    prepend?: boolean;
    placeholder?: string;
    href?: string;
}


export function stringifyYaml(data: unknown) {
    return stringify(data)
}

export function sanitizeFileName(name: string) {
	return name
		.replace(illegalRe, '')
		.replace(controlRe, '')
		.replace(reservedRe, '')
		.replace(windowsReservedRe, '')
		.replace(windowsTrailingRe, '')
		.replace(startsWithDotRe, '')
		.replace(badLinkRe, '');
}

export function genUid(length: number): string {
	let array: string[] = [];
	for (let i = 0; i < length; i++) {
		array.push((Math.random() * 16 | 0).toString(16));
	}
	return array.join('');
}

export function parseHTML(html: string): HTMLElement {
	return new DOMParser().parseFromString(html, 'text/html').documentElement;
}

export function uint8arrayToArrayBuffer(input: Uint8Array): ArrayBuffer {
	return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
}

export function stringToUtf8(text: string): ArrayBuffer {
	return uint8arrayToArrayBuffer(new TextEncoder().encode(text));
}

export function serializeFrontMatter(frontMatter: any): string {
	if (!isEmptyObject(frontMatter)) {
		return '---\n' + stringifyYaml(frontMatter) + '---\n';
	}

	return '';
}

export function truncateText(text: string, limit: number, ellipses: string = '...') {
	if (text.length < limit) {
		return text;
	}

	return text.substring(0, limit) + ellipses;
}

export function HTMLElementfindAll(ele: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(ele.querySelectorAll(selector)) as HTMLElement[];
}

export function isEmptyObject(obj: object): boolean {
    return Object.keys(obj).length === 0;
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (typeof o === 'string') {
        element.textContent = o;
    } else if (typeof o === 'object' && o !== null) {
        if (o.text !== undefined) {
            if (typeof o.text === 'string') {
                element.textContent = o.text;
            } else {
                element.appendChild(o.text);
            }
        }

        if (o.cls) {
            if (Array.isArray(o.cls)) {
                element.classList.add(...o.cls);
            } else {
                element.className = o.cls;
            }
        }

        if (o.attr) {
            for (const key in o.attr) {
                if (o.attr.hasOwnProperty(key)) {
                    const value = o.attr[key];
                    if (value === null) {
                        element.removeAttribute(key);
                    } else {
                        element.setAttribute(key, String(value));
                    }
                }
            }
        }

        if (o.title) {
            element.title = o.title;
        }

        if (o.value) {
            (element as HTMLInputElement).value = o.value;
        }

        if (o.type) {
            (element as HTMLInputElement).type = o.type;
        }

        if (o.placeholder) {
            (element as HTMLInputElement).placeholder = o.placeholder;
        }

        if (o.href) {
            (element as HTMLAnchorElement).href = o.href;
        }

        if (o.parent) {
            if (o.prepend && o.parent.firstChild) {
                o.parent.insertBefore(element, o.parent.firstChild);
            } else {
                o.parent.appendChild(element);
            }
        }
    }

    if (typeof callback === 'function') {
        callback(element);
    }

    return element;
}

export function createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement {
    return createEl('span', o, callback) as HTMLSpanElement;
}

// 计算字符串的 MD5
export function calculateMD5(input: string): string {
    return CryptoJS.MD5(input).toString();
}
