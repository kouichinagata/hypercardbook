// MarkdownAI Verify on screen, shared by Card and Book: field and signature slot HTML, and what happens when they are used.
// The host renders `renderFields()` / `renderSlots()` inside an element with the class `verify-root`, wires
// `handleBodyClick` / `handleBodyChange` / `handleBodyInput` to it, and shows <SignaturePad> while `signingSlot` is set.
// Fields and slots are numbered on fieldView(markdown), as the server does (a HyperBook template shows page 1's fields on every page).
import { tick } from 'svelte';
import { isComplete, signSlotKinds, replaceSignMarkers, changeableSignKinds, replaceChangeableSigns, replaceSignedImages, replaceStampImages, type SignKind } from './markers';
import { replaceFieldMarkers, validateInput, scanFields, setFieldInMarkdown, changeableValues, applyChangeableValues, type FieldMarker } from './fields';
import { fieldStore, fieldView } from '../hyperbook-db';

// Who may sign which slot, and how: sign() returns the new Markdown (the server has already saved it).
// `changeable`: a {{MarkdownAIverify}} slot (signed again any number of times); `fields`: the changeable field values, saved with the signature.
// canFill / fill do the same for Confirm fields ({{MarkdownAIinputConfirm}} / check / radio): text for an input, a boolean for check / radio.
// fillChangeable saves a changeable field on the server each time it is changed; without it (the workspace) the change stays in the
// Markdown on screen and the host saves it as usual.
export type VerifySigner = {
    canSign: (kind: SignKind) => boolean;
    sign: (slot: number, kind: SignKind, result: { svg: string; changeable?: boolean; fields?: (string | boolean | null)[] }) => Promise<string>;
    canFill?: () => boolean;
    fill?: (index: number, value: string | boolean) => Promise<string>;
    fillChangeable?: (index: number, value: string | boolean) => Promise<string>;
};

export type VerifyHost = {
    markdown: string;
    signer?: VerifySigner;
    onMarkdownChange?: (markdown: string) => void;
};

const ROOT = '.verify-root';
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const okMark = (n: number) => `\u0000OK${n}\u0000`;

/** Now, as 2026/11/22 10:30 (UTC+09:00) */
function sentAt(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const zone = `${off < 0 ? '-' : '+'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} (UTC${zone})`;
}

export class VerifyView {
    // Set in the constructor; the derived values below read it only when they are first used
    #host: () => VerifyHost = () => ({ markdown: '' });

    // {{MarkdownAIverifyConfirm}} signature slots: pending (yellow) -> signed (blue, a plain Markdown image link) / error (red).
    // {{MarkdownAIverify}} slots can be signed again: clicking the signature opens the pad again.
    signingSlot = $state<number | null>(null);
    signingChangeable = $state(false);
    signErrorSlots = $state<number[]>([]);

    markdown = $derived(this.#hostMarkdown());
    view = $derived(fieldView(this.markdown));
    signKinds = $derived(signSlotKinds(this.view));
    changeableKinds = $derived(changeableSignKinds(this.view));
    // Confirm fields are live until the document is complete (every Confirm slot signed); a field is gone once confirmed.
    // Changeable fields stay live: each change is saved (by the server, or by the host from the Markdown on screen) and again with a signature.
    fieldsLive = $derived(!!this.#signer()?.fill && !!this.#signer()?.canFill?.() && !isComplete(this.markdown));
    changeableLive = $derived(!!this.#host().onMarkdownChange && !!this.#signer()?.canFill?.());

    // Changes are saved one after another, so a slower answer never overwrites a newer one
    #changeableQueue: Promise<void> = Promise.resolve();

    constructor(host: () => VerifyHost) {
        this.#host = host;
    }

    #hostMarkdown() {
        return this.#host().markdown || '';
    }

    #signer() {
        return this.#host().signer;
    }

    /** A changed view back in the stored form */
    #store(view: string, base = this.markdown): string {
        return fieldStore(base, view) ?? base;
    }

    #emit(markdown: string) {
        this.#host().onMarkdownChange?.(markdown);
    }

    async saveSignature(slot: number, result: { svg: string }) {
        const changeable = this.signingChangeable;
        const signer = this.#signer();
        // The changeable fields on screen are saved together with the signature (the Sign button is what saves them)
        const values = changeableValues(this.view);
        try {
            const kind = (changeable ? this.changeableKinds[slot] : this.signKinds[slot]) ?? 'any';
            this.#emit(await signer!.sign(slot, kind, { ...result, ...(changeable ? { changeable: true } : {}), ...(values.length ? { fields: values } : {}) }));
        } catch (err) {
            console.error('Signature failed:', err);
            if (changeable) alert(err instanceof Error ? err.message : 'Could not sign.');
            else this.signErrorSlots = [...this.signErrorSlots, slot];
        }
        this.cancelSigning();
    }

    cancelSigning() {
        this.signingSlot = null;
        this.signingChangeable = false;
    }

    slotIsSignable(slot: number, changeable = false): boolean {
        const kind = changeable ? this.changeableKinds[slot] : this.signKinds[slot];
        const signer = this.#signer();
        return !!signer && !!kind && signer.canSign(kind);
    }

    /** Save a changeable field's new value; focus stays where the user moved it */
    keepChangeable(index: number, value: string | boolean) {
        const next = setFieldInMarkdown(this.view, index, value);
        if (next === null || next === this.view) return;
        const local = this.#store(next);
        this.#changeableQueue = this.#changeableQueue.then(async () => {
            let saved = local;
            const signer = this.#signer();
            if (signer?.fillChangeable) {
                try {
                    saved = await signer.fillChangeable(index, value);
                } catch (err) {
                    console.error('Saving the field failed:', err);
                    alert(err instanceof Error ? err.message : 'Could not save.');
                    return;
                }
            } else await new Promise((resolve) => setTimeout(resolve, 0));
            const focused = (document.activeElement as HTMLElement | null)?.closest?.('.field-slot')?.getAttribute('data-field');
            this.#emit(saved);
            if (focused == null) return;
            await tick();
            (document.querySelector(`${ROOT} .field-slot[data-field="${focused}"] :is(input, textarea)`) as HTMLElement | null)?.focus();
        });
    }

    /** Show a slider's number while it moves */
    handleBodyInput = (e: Event) => {
        const range = e.target as HTMLInputElement | null;
        if (range?.classList?.contains('field-range')) {
            const out = range.nextElementSibling;
            if (out?.classList.contains('field-range-value')) out.textContent = range.value;
        }
    };

    handleBodyChange = (e: Event) => {
        const box = e.target as HTMLInputElement | HTMLTextAreaElement | null;
        const slotEl = box?.closest?.('.field-slot[data-changeable]') as HTMLElement | null;
        if (!box || !slotEl || !this.changeableLive) return;
        const index = Number(slotEl.dataset.field);
        const field = scanFields(this.view)[index];
        if (!field || field.confirm) return;
        if (field.kind === 'check') this.keepChangeable(index, (box as HTMLInputElement).checked);
        else if (field.kind === 'radio') {
            if ((box as HTMLInputElement).checked) this.keepChangeable(index, true);
        } else if (field.kind === 'slider' || field.kind === 'select') {
            if (box.value !== '') this.keepChangeable(index, box.value);
        } else {
            const problem = box.value === '' ? null : validateInput(field.input!, box.value);
            if (problem) {
                alert(problem);
                return;
            }
            this.keepChangeable(index, box.value);
        }
    };

    async saveField(index: number, value: string | boolean) {
        try {
            const view = this.view;
            const saved = await this.#signer()!.fill!(index, value);
            // The server's copy does not have the changeable values still on screen: keep them
            const kept = applyChangeableValues(fieldView(saved), changeableValues(view));
            this.#emit(kept === null ? saved : this.#store(kept, saved));
        } catch (err) {
            console.error('Saving the field failed:', err);
            alert(err instanceof Error ? err.message : 'Could not save.');
        }
    }

    commitField(slotEl: HTMLElement) {
        const index = Number(slotEl.dataset.field);
        const field = scanFields(this.view)[index];
        if (!field) return;
        if (field.kind === 'check') {
            this.saveField(index, (slotEl.querySelector('input') as HTMLInputElement).checked);
        } else if (field.kind === 'slider') {
            this.saveField(index, (slotEl.querySelector('input') as HTMLInputElement).value);
        } else if (field.kind === 'select') {
            const value = (slotEl.querySelector('select') as HTMLSelectElement).value;
            if (value === '') {
                alert('Select an option.');
                return;
            }
            this.saveField(index, value);
        } else if (field.kind === 'radio') {
            // The Confirm button sits on the last option; the selected one is whichever radio of the group is on
            const picked = slotEl.closest(ROOT)?.querySelector(`input[name="${(slotEl.querySelector('input') as HTMLInputElement).name}"]:checked`) as HTMLInputElement | null;
            if (!picked) {
                alert('Select an option.');
                return;
            }
            this.saveField(Number(picked.dataset.field), true);
        } else {
            const box = slotEl.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
            const problem = validateInput(field.input!, box.value);
            if (problem) {
                alert(problem);
                return;
            }
            this.saveField(index, box.value);
        }
    }

    /** Opens the mail app (to the button's addresses) with the whole Markdown as the body (the YAML frontmatter is not Markdown: left out) */
    openMailto(to: string[]) {
        const body = this.markdown.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '').replace(/^\s+/, '');
        const a = document.createElement('a');
        a.href = `mailto:${to.join(',')}?body=${encodeURIComponent(body)}`;
        a.click();
    }

    handleBodyClick = (e: MouseEvent) => {
        const mail = (e.target as HTMLElement | null)?.closest?.('.field-mailto') as HTMLButtonElement | null;
        if (mail) {
            const slotEl = mail.closest('.field-slot') as HTMLElement | null;
            const index = Number((slotEl ?? mail).dataset.field);
            const field = scanFields(this.view)[index];
            if (field?.kind !== 'button') return;
            // The Confirm version is sent once: it is replaced with "Sent by email to … on …"
            if (field.confirm) {
                if (!this.fieldsLive) return;
                this.openMailto(field.mailto!);
                this.saveField(index, sentAt());
            } else this.openMailto(field.mailto!);
            return;
        }
        const ok = (e.target as HTMLElement | null)?.closest?.('.field-ok') as HTMLElement | null;
        if (ok && this.fieldsLive) {
            // A text field's button sits in its slot; a check box / radio button sits after the label
            const slot = (ok.closest('.field-slot') ?? ok.closest(ROOT)?.querySelector(`.field-slot[data-field="${ok.dataset.field}"]`)) as HTMLElement | null;
            if (slot) this.commitField(slot);
            return;
        }
        const again = (e.target as HTMLElement | null)?.closest?.('[data-cslot]') as HTMLElement | null;
        if (again) {
            if (!this.slotIsSignable(Number(again.dataset.cslot), true)) return;
            this.signingChangeable = true;
            this.signingSlot = Number(again.dataset.cslot);
            return;
        }
        const el = (e.target as HTMLElement | null)?.closest?.('.sign-pending') as HTMLElement | null;
        if (!el || !this.slotIsSignable(Number(el.dataset.slot))) return;
        // The last signature completes the document and locks its fields
        if (this.signKinds.length === 1 && scanFields(this.view).some((f) => f.confirm)) {
            alert('Fill in every field before the last signature.');
            return;
        }
        this.signingSlot = Number(el.dataset.slot);
    };

    #sliderHtml(field: FieldMarker, off: string) {
        return `<input class="field-range" type="range" min="${field.range!.min}" max="${field.range!.max}" step="1" value="${field.value}"${off}><output class="field-range-value">${field.value}</output>`;
    }

    #selectHtml(field: FieldMarker, off: string): string {
        const none = field.selected! < 0 ? '<option value="" disabled selected>Select…</option>' : '';
        const options = field.options!.map((o, i) => `<option value="${i}"${i === field.selected ? ' selected' : ''}>${attr(o)}</option>`).join('');
        return `<select class="field-input"${off}>${none}${options}</select>`;
    }

    #renderChangeableField(field: FieldMarker): string {
        const off = this.changeableLive ? '' : ' disabled';
        const n = field.index;
        const slot = (inner: string) => `<span class="field-slot" data-field="${n}" data-changeable="1">${inner}</span>`;
        // Mailto changes nothing, so anyone can use it at any time
        if (field.kind === 'button') return `<button type="button" class="field-mailto" data-field="${n}">Mailto</button>`;
        if (field.kind === 'slider') return slot(this.#sliderHtml(field, off));
        if (field.kind === 'select') return slot(this.#selectHtml(field, off));
        if (field.kind === 'check') return slot(`<input class="field-toggle" type="checkbox"${field.checked ? ' checked' : ''}${off}>`);
        if (field.kind === 'radio') return slot(`<input class="field-toggle" type="radio" name="field-group-${field.group}" data-field="${n}"${field.checked ? ' checked' : ''}${off}>`);
        const spec = field.input!;
        const value = field.value ?? '';
        if (spec.type === 'date') return slot(`<input class="field-input" type="date" value="${attr(value)}"${off}>`);
        if (spec.type === 'time') return slot(`<input class="field-input" type="time" value="${attr(value)}"${off}>`);
        if (spec.type === 'textarea') return slot(`<textarea class="field-input" rows="4"${off}>${attr(value).replace(/\r?\n/g, '&#10;')}</textarea>`);
        const maxlength = spec.length === null ? '' : ` maxlength="${spec.length}"`;
        return slot(`<input class="field-input" type="text" value="${attr(value)}"${maxlength}${spec.type === 'digits' ? ' inputmode="numeric" pattern="[0-9]*"' : ''}${off}>`);
    }

    #renderField(field: FieldMarker): string {
        if (!field.confirm) return this.#renderChangeableField(field);
        const off = this.fieldsLive ? '' : ' disabled';
        const n = field.index;
        // A check box or radio is followed by its label, so its Confirm button goes at the end of the label (see placeOkButtons)
        if (field.kind === 'check') {
            return `<span class="field-slot" data-field="${n}"><input class="field-toggle" type="checkbox"${field.checked ? ' checked' : ''}${off}></span>${okMark(n)}`;
        }
        if (field.kind === 'radio') {
            const mark = field.lastInGroup ? okMark(n) : '';
            return `<span class="field-slot" data-field="${n}"><input class="field-toggle" type="radio" name="field-group-${field.group}" data-field="${n}"${field.checked ? ' checked' : ''}${off}></span>${mark}`;
        }
        if (field.kind === 'button') return `<span class="field-slot" data-field="${n}"><button type="button" class="field-mailto"${off}>Mailto</button></span>`;
        const ok = `<button type="button" class="field-ok"${off}>Confirm</button>`;
        if (field.kind === 'slider') return `<span class="field-slot" data-field="${n}">${this.#sliderHtml(field, off)}${ok}</span>`;
        if (field.kind === 'select') return `<span class="field-slot" data-field="${n}">${this.#selectHtml(field, off)}${ok}</span>`;
        const spec = field.input!;
        let box: string;
        if (spec.type === 'date') box = `<input class="field-input" type="date"${off}>`;
        else if (spec.type === 'time') box = `<input class="field-input" type="time"${off}>`;
        else if (spec.type === 'textarea') box = `<textarea class="field-input" rows="4"${off}></textarea>`;
        else {
            const maxlength = spec.length === null ? '' : ` maxlength="${spec.length}"`;
            box = `<input class="field-input" type="text"${maxlength}${spec.type === 'digits' ? ' inputmode="numeric" pattern="[0-9]*"' : ''}${off}>`;
        }
        return `<span class="field-slot" data-field="${n}">${box}<button type="button" class="field-ok"${off}>Confirm</button></span>`;
    }

    /** Move each check box / radio Confirm mark past its label: to the end of the line, or of the table cell */
    #placeOkButtons(md: string): string {
        const off = this.fieldsLive ? '' : ' disabled';
        return md.replace(/\u0000OK(\d+)\u0000([^\r\n|\u0000]*?)([ \t]*)(?=\r?\n|\||\u0000|$)/g, (_m, n, label, tail) => `${label}<button type="button" class="field-ok" data-field="${n}"${off}>Confirm</button>${tail}`);
    }

    #renderSignSlot(slot: number): string {
        if (this.signErrorSlots.includes(slot)) {
            return `<span class="sign-slot sign-error" data-slot="${slot}">sign error</span>`;
        }
        const signable = this.slotIsSignable(slot);
        const title = signable ? 'Click to sign' : 'You cannot sign this slot';
        return `<span class="sign-slot sign-pending" data-slot="${slot}" data-signable="${signable}" title="${title}">✍ sign here</span>`;
    }

    #renderChangeableSlot(slot: number, url: string | null): string {
        const signable = this.slotIsSignable(slot, true);
        if (url) {
            const title = signable ? 'Click to sign again' : 'Signature';
            return `<span class="sign-slot sign-signed${signable ? ' sign-again' : ''}" data-cslot="${slot}" title="${title}"><img src="${attr(url)}" alt="signature"></span>`;
        }
        const title = signable ? 'Click to sign' : 'You cannot sign this slot';
        return `<span class="sign-slot sign-pending" data-cslot="${slot}" data-signable="${signable}" title="${title}">✍ sign here</span>`;
    }

    /** The view (frontmatter included) with every field replaced by its HTML; fields are numbered on the whole view, as the server does */
    renderFields(): string {
        return this.#placeOkButtons(replaceFieldMarkers(this.view, (f) => this.#renderField(f)));
    }

    /** Seals, signatures and signature slots as HTML (slots are numbered in order, so pass the text with the frontmatter removed only) */
    renderSlots(md: string): string {
        // Seals pressed before the signature sit left-aligned in a row of inline boxes, so many of them wrap onto new lines
        let out = replaceStampImages(md, (url) => `<span class="sign-slot sign-stamp"><img src="${url}" alt="seal"></span>`);
        out = replaceSignedImages(out, (url) => `<span class="sign-slot sign-signed"><img src="${url}" alt="signature"></span>`);
        out = replaceSignMarkers(out, (slot) => this.#renderSignSlot(slot));
        return replaceChangeableSigns(out, (slot, _kind, url) => this.#renderChangeableSlot(slot, url));
    }
}
