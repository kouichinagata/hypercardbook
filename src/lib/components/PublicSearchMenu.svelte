<script lang="ts">
    let {
        typeFilters = [],
        typeValue = 'all',
        onTypeChange = null,
        ddcClasses = [],
        ddcMajor = '',
        ddcMinor = '',
        ddcMinorOptions = [],
        onDdcMajorChange = null,
        onDdcMinorChange = null,
        titleQuery = '',
        onTitleChange = null,
        authorQuery = '',
        onAuthorChange = null
    } = $props();
</script>

<!-- Placed once below all shelves (outside Bookshelf) so it is never
     re-created when shelves appear, reload, or reflow; this keeps input
     focus while typing a search. -->
<div class="public-search-menu" role="search" aria-label="Public Books search menu">
    <label class="public-search-field">
        <span>Book Type</span>
        <select
            value={typeValue}
            onchange={(event) => onTypeChange?.((event.currentTarget as HTMLSelectElement).value)}
        >
            {#each typeFilters as filter (filter.id)}
                <option value={filter.id}>{filter.label}</option>
            {/each}
        </select>
    </label>
    <label class="public-search-field">
        <span>Classification (DDC)</span>
        <select
            value={ddcMajor}
            onchange={(event) => onDdcMajorChange?.((event.currentTarget as HTMLSelectElement).value)}
        >
            <option value="">All classifications</option>
            {#each ddcClasses as item (item.code)}
                <option value={item.code}>{item.code} {item.shortLabel}</option>
            {/each}
        </select>
    </label>
    {#if ddcMajor}
        <label class="public-search-field">
            <span>Division</span>
            <select
                value={ddcMinor}
                onchange={(event) => onDdcMinorChange?.((event.currentTarget as HTMLSelectElement).value)}
            >
                <option value="">(Major class only)</option>
                {#each ddcMinorOptions as item (item.code)}
                    <option value={item.code}>{item.code} {item.label}</option>
                {/each}
            </select>
        </label>
    {/if}
    <label class="public-search-field public-search-text">
        <span>Title</span>
        <input
            type="search"
            value={titleQuery}
            placeholder="Search by title"
            oninput={(event) => onTitleChange?.((event.currentTarget as HTMLInputElement).value)}
        />
    </label>
    <label class="public-search-field public-search-text">
        <span>Author</span>
        <input
            type="search"
            value={authorQuery}
            placeholder="Search by author"
            oninput={(event) => onAuthorChange?.((event.currentTarget as HTMLInputElement).value)}
        />
    </label>
</div>

<style>
    .public-search-menu {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 10px 12px;
        width: 90%;
        max-width: 960px;
        margin-bottom: 60px;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.2);
        box-sizing: border-box;
    }
    .public-search-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 0 1 170px;
        min-width: 120px;
    }
    .public-search-text {
        flex: 1 1 160px;
    }
    .public-search-field span {
        font-size: 11px;
        font-weight: 700;
        opacity: 0.78;
    }
    .public-search-field select,
    .public-search-field input {
        width: 100%;
        height: 32px;
        padding: 0 8px;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font: inherit;
        font-size: 12px;
    }
    /* Keep dropdown options readable on dark theme (some browsers render them white-on-white). */
    .public-search-field option {
        color: #1a1a1a;
    }
    :global([data-theme="light"]) .public-search-menu {
        border-color: rgba(61, 37, 22, 0.18);
        background: rgba(61, 37, 22, 0.05);
    }
    :global([data-theme="light"]) .public-search-field select,
    :global([data-theme="light"]) .public-search-field input {
        border-color: rgba(61, 37, 22, 0.25);
        background: rgba(61, 37, 22, 0.05);
        color: #3d2516;
    }
    @media (max-width: 600px) {
        .public-search-menu {
            padding: 10px 12px;
        }
        .public-search-field {
            flex-basis: calc(50% - 6px);
        }
    }
</style>
