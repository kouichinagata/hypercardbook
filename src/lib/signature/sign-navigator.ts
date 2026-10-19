// Guides a signer through the slots they can sign (browser only: it reads the rendered card).
// Shared by the card page (?sign=1, opened from PapeRobo) and anything else that wants prev / next / done.
const SIGNABLE = '.sign-pending[data-signable="true"]';

export type SignProgress = { remaining: number; done: boolean; others: number };

export function signableSlots(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(SIGNABLE));
}

/** `done`: the card has signature slots and none is left to sign. `others`: unsigned slots that belong to someone else. */
export function signProgress(root: ParentNode = document): SignProgress {
    const remaining = signableSlots(root).length;
    const others = root.querySelectorAll('.sign-pending[data-signable="false"]').length;
    return { remaining, others, done: remaining === 0 && others === 0 && root.querySelector('.sign-signed') !== null };
}

/** Index of the slot to go to from `current` (-1 = none yet), wrapping around; -1 when there is no slot */
export function stepIndex(count: number, current: number, direction: 1 | -1): number {
    if (count <= 0) return -1;
    if (current < 0) return direction === 1 ? 0 : count - 1;
    return (current + direction + count) % count;
}

/** Scroll to a slot and flash it so the signer sees where to sign. Returns false when there is nothing to go to. */
export function goToSlot(direction: 1 | -1, from: HTMLElement | null = null, root: ParentNode = document): HTMLElement | null {
    const slots = signableSlots(root);
    const target = slots[stepIndex(slots.length, from ? slots.indexOf(from) : -1, direction)];
    if (!target) return null;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('sign-focus');
    setTimeout(() => target.classList.remove('sign-focus'), 1500);
    return target;
}
