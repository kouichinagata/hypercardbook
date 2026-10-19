<script lang="ts">
    import { onMount } from 'svelte';
    import { goToSlot, signProgress, type SignProgress } from './sign-navigator';

    // A bar at the bottom of the card page: how many slots are left, previous / next, and "all done"
    let progress = $state<SignProgress>({ remaining: 0, done: false });
    let current: HTMLElement | null = null;
    let started = false;

    function step(direction: 1 | -1) {
        current = goToSlot(direction, current && current.isConnected ? current : null);
    }

    onMount(() => {
        const update = () => {
            const next = signProgress();
            const signedOne = next.remaining < progress.remaining;
            progress = next;
            if (!started && next.remaining > 0) {
                // First time slots are signable: take the signer to the first one
                started = true;
                current = goToSlot(1);
            } else if (signedOne && next.remaining > 0) {
                current = goToSlot(1);
            }
        };
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-signable', 'class'] });
        return () => observer.disconnect();
    });
</script>

<div class="sign-nav" class:done={progress.done} role="status" aria-live="polite">
    {#if progress.done}
        <span>All signatures are complete.</span>
    {:else if progress.remaining > 0}
        <span>{progress.remaining} {progress.remaining === 1 ? 'signature' : 'signatures'} left</span>
        <button type="button" onclick={() => step(-1)}>Previous</button>
        <button type="button" class="primary" onclick={() => step(1)}>Next</button>
    {:else}
        <span>Nothing to sign here.</span>
    {/if}
</div>

<style>
    .sign-nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9000;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px 16px;
        background: #fff6b3;
        color: #333;
        font-size: 16px;
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
    }
    .sign-nav.done {
        background: #dbeafe;
    }
    button {
        padding: 8px 16px;
        border: 1px solid #bbb;
        border-radius: 8px;
        background: #fff;
        color: #111;
        font-size: 16px;
        cursor: pointer;
    }
    button.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
    }
</style>
