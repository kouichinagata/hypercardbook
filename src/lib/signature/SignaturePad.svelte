<script lang="ts">
    import { onMount } from 'svelte';
    import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH, strokesToSvg, type Point } from './signature-svg';

    // Standalone: no dependency on Card, so PapeRobo can mount it too
    let {
        onsave,
        oncancel,
        title = 'サインしてください'
    }: {
        onsave: (result: { svg: string }) => void | Promise<void>;
        oncancel: () => void;
        title?: string;
    } = $props();

    let canvas: HTMLCanvasElement;
    let strokes: Point[][] = [];
    let current: Point[] | null = null;
    let hasInk = $state(false);
    let busy = $state(false);
    let failed = $state(false);

    onMount(() => clear());

    function clear() {
        strokes = [];
        current = null;
        hasInk = false;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111';
    }

    function pointOf(e: PointerEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * SIGNATURE_WIDTH,
            y: ((e.clientY - rect.top) / rect.height) * SIGNATURE_HEIGHT
        };
    }

    function down(e: PointerEvent) {
        canvas.setPointerCapture(e.pointerId);
        current = [pointOf(e)];
        strokes.push(current);
        hasInk = true;
    }

    function move(e: PointerEvent) {
        if (!current) return;
        const p = pointOf(e);
        const prev = current[current.length - 1];
        current.push(p);
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }

    function up() {
        current = null;
    }

    async function save() {
        if (!hasInk || busy) return;
        busy = true;
        failed = false;
        try {
            await onsave({ svg: strokesToSvg(strokes) });
        } catch {
            failed = true;
        } finally {
            busy = false;
        }
    }
</script>

<div class="sign-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div class="sign-dialog">
        <div class="sign-title">{title}</div>
        <canvas
            bind:this={canvas}
            width={SIGNATURE_WIDTH}
            height={SIGNATURE_HEIGHT}
            onpointerdown={down}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
        ></canvas>
        {#if failed}<div class="sign-failed">サインできませんでした。もう一度お試しください。</div>{/if}
        <div class="sign-actions">
            <button type="button" onclick={oncancel} disabled={busy}>キャンセル</button>
            <button type="button" onclick={clear} disabled={busy || !hasInk}>消す</button>
            <button type="button" class="primary" onclick={save} disabled={busy || !hasInk}>サインする</button>
        </div>
    </div>
</div>

<style>
    .sign-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }
    .sign-dialog {
        background: #fff;
        color: #111;
        border-radius: 12px;
        padding: 16px;
        width: min(640px, 100%);
        box-sizing: border-box;
    }
    .sign-title {
        font-weight: 600;
        margin-bottom: 8px;
    }
    canvas {
        width: 100%;
        aspect-ratio: 600 / 240;
        border: 1px solid #bbb;
        border-radius: 8px;
        background: #fffef5;
        touch-action: none;
        cursor: crosshair;
        display: block;
    }
    .sign-failed {
        margin-top: 8px;
        color: #b91c1c;
        font-size: 14px;
    }
    .sign-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
    }
    button {
        padding: 8px 14px;
        border: 1px solid #bbb;
        border-radius: 8px;
        background: #f4f4f4;
        color: #111;
        font-size: 14px;
        cursor: pointer;
    }
    button.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
    }
    button:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
