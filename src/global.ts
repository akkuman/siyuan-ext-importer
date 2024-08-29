
interface ObjectConstructor {
    isEmpty(obj: object): boolean;
}

interface HTMLElement extends Element {
    find(selector: string): HTMLElement;
    findAll(selector: string): HTMLElement[];
}

interface Element extends Node {
    getText(): string;
    setText(val: string | DocumentFragment): void;
    addClass(...classes: string[]): void;
    addClasses(classes: string[]): void;
    removeClass(...classes: string[]): void;
    removeClasses(classes: string[]): void;
    toggleClass(classes: string | string[], value: boolean): void;
    hasClass(cls: string): boolean;
    setAttr(qualifiedName: string, value: string | number | boolean | null): void;
    setAttrs(obj: {
        [key: string]: string | number | boolean | null;
    }): void;
    getAttr(qualifiedName: string): string | null;
    matchParent(selector: string, lastParent?: Element): Element | null;
    getCssPropertyValue(property: string, pseudoElement?: string): string;
    isActiveElement(): boolean;
}

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

interface SvgElementInfo {
    /**
     * The class to be assigned. Can be a space-separated string or an array of strings.
     */
    cls?: string | string[];
    /**
     * HTML attributes to be added.
     */
    attr?: {
        [key: string]: string | number | boolean | null;
    };
    /**
     * The parent element to be assigned to.
     */
    parent?: Node;
    prepend?: boolean;
}

interface String {
    contains(target: string): boolean;
    startsWith(searchString: string, position?: number): boolean;
    endsWith(target: string, length?: number): boolean;
    format(...args: string[]): string;
}

interface Node {
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomElementInfo | string, callback?: (el: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K];
    createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
    createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
}

// 添加 isEmpty 方法的实现
Object.isEmpty = function (obj: object): boolean {
    return Object.keys(obj).length === 0;
};

HTMLElement.prototype.find = function (this: HTMLElement, selector: string): HTMLElement | null {
    return this.querySelector(selector);
};

HTMLElement.prototype.findAll = function (this: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(this.querySelectorAll(selector)) as HTMLElement[];
};

String.prototype.contains = function (this: string, target: string): boolean {
    return this.indexOf(target) !== -1;
};

String.prototype.startsWith = function (this: string, searchString: string, position?: number): boolean {
    return this.slice(position || 0, position! + searchString.length) === searchString;
};

String.prototype.endsWith = function (this: string, target: string, length?: number): boolean {
    const strLength = length !== undefined ? length : this.length;
    return this.slice(strLength - target.length, strLength) === target;
};

String.prototype.format = function (this: string, ...args: string[]): string {
    return this.replace(/{(\d+)}/g, (match, number) => {
        return typeof args[number] !== 'undefined' ? args[number] : match;
    });
};

Element.prototype.getText = function (this: Element): string {
    return this.textContent || '';
};

Element.prototype.setText = function (this: Element, val: string | DocumentFragment): void {
    if (typeof val === 'string') {
        this.textContent = val;
    } else {
        this.innerHTML = '';
        this.appendChild(val);
    }
};

Element.prototype.addClass = function (this: Element, ...classes: string[]): void {
    this.classList.add(...classes);
};

Element.prototype.addClasses = function (this: Element, classes: string[]): void {
    this.classList.add(...classes);
};

Element.prototype.removeClass = function (this: Element, ...classes: string[]): void {
    this.classList.remove(...classes);
};

Element.prototype.removeClasses = function (this: Element, classes: string[]): void {
    this.classList.remove(...classes);
};

Element.prototype.toggleClass = function (this: Element, classes: string | string[], value: boolean): void {
    if (typeof classes === 'string') {
        this.classList.toggle(classes, value);
    } else {
        classes.forEach(cls => this.classList.toggle(cls, value));
    }
};

Element.prototype.hasClass = function (this: Element, cls: string): boolean {
    return this.classList.contains(cls);
};

Element.prototype.setAttr = function (this: Element, qualifiedName: string, value: string | number | boolean | null): void {
    if (value === null) {
        this.removeAttribute(qualifiedName);
    } else {
        this.setAttribute(qualifiedName, String(value));
    }
};

Element.prototype.setAttrs = function (this: Element, obj: { [key: string]: string | number | boolean | null }): void {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            this.setAttr(key, obj[key]);
        }
    }
};

Element.prototype.getAttr = function (this: Element, qualifiedName: string): string | null {
    return this.getAttribute(qualifiedName);
};

Element.prototype.matchParent = function (this: Element, selector: string, lastParent?: Element): Element | null {
    let parent = this.parentElement;
    while (parent && parent !== lastParent) {
        if (parent.matches(selector)) {
            return parent;
        }
        parent = parent.parentElement;
    }
    return null;
};

Element.prototype.getCssPropertyValue = function (this: Element, property: string, pseudoElement?: string): string {
    const style = getComputedStyle(this, pseudoElement || null);
    return style.getPropertyValue(property);
};

Element.prototype.isActiveElement = function (this: Element): boolean {
    return document.activeElement === this;
};

function createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement {
    const span = document.createElement('span');

    if (typeof o === 'string') {
        span.textContent = o;
    } else if (typeof o === 'object' && o !== null) {
        if (o.text !== undefined) {
            if (typeof o.text === 'string') {
                span.textContent = o.text;
            } else {
                span.appendChild(o.text);
            }
        }

        if (o.cls) {
            if (Array.isArray(o.cls)) {
                span.classList.add(...o.cls);
            } else {
                span.className = o.cls;
            }
        }

        if (o.attr) {
            for (const key in o.attr) {
                if (o.attr.hasOwnProperty(key)) {
                    const value = o.attr[key];
                    if (value === null) {
                        span.removeAttribute(key);
                    } else {
                        span.setAttribute(key, String(value));
                    }
                }
            }
        }

        if (o.title) {
            span.title = o.title;
        }

        if (o.value) {
            span.setAttribute('value', o.value);
        }

        if (o.type) {
            span.setAttribute('type', o.type);
        }

        if (o.placeholder) {
            span.setAttribute('placeholder', o.placeholder);
        }

        if (o.href) {
            span.setAttribute('href', o.href);
        }

        if (o.parent) {
            if (o.prepend) {
                o.parent.insertBefore(span, o.parent.firstChild);
            } else {
                o.parent.appendChild(span);
            }
        }
    }

    if (typeof callback === 'function') {
        callback(span);
    }

    return span;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
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

Node.prototype.createEl = function<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (typeof o === 'string') {
        element.textContent = o;
    } else if (o) {
        if (o.text) {
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
        } else {
            this.appendChild(element);
        }
    } else {
        this.appendChild(element);
    }

    if (callback) {
        callback(element);
    }

    return element;
};

Node.prototype.createDiv = function(
    o?: DomElementInfo | string,
    callback?: (el: HTMLDivElement) => void
): HTMLDivElement {
    return this.createEl('div', o, callback) as HTMLDivElement;
};

Node.prototype.createSpan = function(
    o?: DomElementInfo | string,
    callback?: (el: HTMLSpanElement) => void
): HTMLSpanElement {
    return this.createEl('span', o, callback) as HTMLSpanElement;
};

(window as any).createSpan = createSpan;
(window as any).createEl = createEl;
