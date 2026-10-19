<script lang="ts">
    import Card from '$lib/components/Card.svelte';
    import { guestMaySign } from '$lib/signature/markers';

    let { data } = $props();
    let markdown = $state(data.markdown);
    let version = $state(data.version);
    let name = $state('');

    // Without login only your / MarkdownAIVerify slots can be signed (my is the owner's)
    const signer = {
        canSign: guestMaySign,
        sign: async (slot: number, kind: string, result: { svg: string; webp: string }) => {
            const res = await fetch(location.pathname, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot, kind, baseVersion: version, name, ...result })
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || 'sign failed');
            version = out.version;
            return out.markdown as string;
        }
    };
</script>

<svelte:head>
    <title>サイン依頼</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="sign-page">
    <div class="sign-bar">
        <span>黄色の「sign here」をタップしてサインしてください（{new Date(data.expiresAt).toLocaleDateString()} まで有効）</span>
        <input bind:value={name} placeholder="お名前（任意）" maxlength="100" />
    </div>
    <div class="sign-card">
        <Card {markdown} isEmbed={true} showNewTab={false} {signer} onMarkdownChange={(next) => (markdown = next)} />
    </div>
</div>

<style>
    .sign-page {
        display: flex;
        flex-direction: column;
        height: 100vh;
    }
    .sign-bar {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        padding: 8px 16px;
        background: #fff6b3;
        color: #333;
        font-size: 14px;
    }
    .sign-bar input {
        padding: 6px 10px;
        border: 1px solid #bbb;
        border-radius: 6px;
        font-size: 14px;
    }
    .sign-card {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }
    .sign-card :global(.card-reader-container) {
        width: 100%;
        height: auto;
        min-height: 100%;
    }
</style>
