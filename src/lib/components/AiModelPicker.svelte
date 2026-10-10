<script lang="ts">
    import { onMount } from 'svelte';
    import {
        AI_KEYS_CHANGED_EVENT,
        AI_MODEL_STORAGE_KEY,
        DEFAULT_CLAUDE_LABEL,
        DEFAULT_CLAUDE_MODEL,
        DEFAULT_IMAGE_MODEL,
        GEMINI_TEXT_LABEL,
        GEMINI_TEXT_MODEL,
        IMAGE_MODELS,
        IMAGE_MODEL_STORAGE_KEY,
        isImageModelId
    } from '$lib/ai-model';

    // imageMode: 画像生成（Generate image）が ON のとき true。自分の Gemini キーがあれば、文章モデルの代わりに画像モデルを選ぶ。
    let { disabled = false, imageMode = false }: { disabled?: boolean; imageMode?: boolean } = $props();

    type Option = { id: string; label: string };

    let claudeModels = $state<Option[]>([]);
    let hasClaudeKey = $state(false);
    let hasGeminiKey = $state(false);
    let selected = $state(DEFAULT_CLAUDE_MODEL);
    let selectedImage = $state<string>(DEFAULT_IMAGE_MODEL);
    const showImageModels = $derived(imageMode && hasGeminiKey);

    // Claudeキー未登録なら既定のHaikuのみ。登録後はAPIから取得した全モデル。Geminiキーがあれば3.8 Flashを追加。
    const options = $derived.by(() => {
        const list: Option[] = claudeModels.length ? [...claudeModels] : [{ id: DEFAULT_CLAUDE_MODEL, label: DEFAULT_CLAUDE_LABEL }];
        if (hasGeminiKey) list.push({ id: GEMINI_TEXT_MODEL, label: GEMINI_TEXT_LABEL });
        return list;
    });

    function read(key: string): string {
        try {
            return localStorage.getItem(key)?.trim() || '';
        } catch {
            return '';
        }
    }

    function persist() {
        try {
            localStorage.setItem(AI_MODEL_STORAGE_KEY, selected);
        } catch {
            // 保存できなくても動作には影響しない
        }
    }

    function persistImage() {
        try {
            localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, selectedImage);
        } catch {
            // 保存できなくても動作には影響しない
        }
    }

    async function refresh() {
        const claudeKey = read('user_anthropic_api_key');
        hasClaudeKey = Boolean(claudeKey);
        hasGeminiKey = Boolean(read('user_gemini_api_key'));
        claudeModels = [];
        if (claudeKey) {
            try {
                const res = await fetch('/api/ai-models', { headers: { 'x-user-anthropic-api-key': claudeKey }, cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    claudeModels = (data.models || []).map((m: { id: string; name: string }) => ({ id: m.id, label: m.name }));
                }
            } catch {
                // 取得に失敗したら既定のモデルのみ表示する
            }
        }
        const savedImage = read(IMAGE_MODEL_STORAGE_KEY);
        selectedImage = isImageModelId(savedImage) ? savedImage : DEFAULT_IMAGE_MODEL;
        const saved = read(AI_MODEL_STORAGE_KEY);
        const ids = options.map((o) => o.id);
        selected = ids.includes(saved)
            ? saved
            : ids.includes(DEFAULT_CLAUDE_MODEL) ? DEFAULT_CLAUDE_MODEL : ids[0];
    }

    onMount(() => {
        void refresh();
        const onChange = () => void refresh();
        window.addEventListener(AI_KEYS_CHANGED_EVENT, onChange);
        window.addEventListener('storage', onChange);
        return () => {
            window.removeEventListener(AI_KEYS_CHANGED_EVENT, onChange);
            window.removeEventListener('storage', onChange);
        };
    });
</script>

{#if showImageModels}
    <select
        class="ai-model-select"
        bind:value={selectedImage}
        onchange={persistImage}
        {disabled}
        title="Image model"
        aria-label="Image model"
    >
        {#each IMAGE_MODELS as option (option.id)}
            <option value={option.id}>{option.label}</option>
        {/each}
    </select>
{:else if options.length > 1}
    <select
        class="ai-model-select"
        bind:value={selected}
        onchange={persist}
        {disabled}
        title="AI model"
        aria-label="AI model"
    >
        {#each options as option (option.id)}
            <option value={option.id}>{option.label}</option>
        {/each}
    </select>
{:else}
    <span class="ai-model-label" title={hasClaudeKey ? 'AI model' : 'Register a Claude API key in Settings to choose other models'}>
        {options[0].label}
    </span>
{/if}

<style>
    .ai-model-label,
    .ai-model-select {
        font-family: inherit;
        font-size: 12px;
        color: inherit;
        opacity: 0.75;
        white-space: nowrap;
    }
    .ai-model-label {
        padding: 0 6px;
    }
    .ai-model-select {
        background: transparent;
        border: 1px solid rgba(128, 128, 128, 0.35);
        border-radius: 8px;
        padding: 3px 6px;
        max-width: 190px;
        cursor: pointer;
    }
    .ai-model-select:hover:not(:disabled) {
        opacity: 1;
    }
    .ai-model-select:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .ai-model-select option {
        color: #111111;
        background: #ffffff;
    }
</style>
