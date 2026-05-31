---
id: hypercardbook2
title: HyperCard Program
sub_title: HyperCardを用いたプログランムの例です。HTMLタブで出力して実行してください！
play_mode: card
---

# 検索置き換えエディター

<div class="abody">
    <div class="header">
        <h1>Web Editor</h1>
    </div>

<div class="toolbar">
<div class="toolbar-group">
            <label for="searchInput">検索:</label>
            <input type="text" id="searchInput" placeholder="検索する文字列を入力">
            <button id="searchBtn">検索</button>
</div>

<div class="toolbar-group">
            <label for="replaceInput">置換:</label>
            <input type="text" id="replaceInput" placeholder="置換後の文字列を入力">
            <button id="replaceBtn" class="replace-btn">置換</button>
            <button id="replaceAllBtn" class="replace-all-btn">すべて置換</button>
</div>
        <button id="clearBtn" class="clear-btn">クリア</button>
</div>

<div class="editor-container">
        <textarea id="editor" placeholder="ここにテキストを入力してください..."></textarea>
</div>

<div class="status-bar">
        <span id="statusText">自動保存済み</span>
        <span id="searchInfo" class="search-info"></span>
</div>
</div>


<style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            display: flex;
            flex-direction: column;
        }

        .abody {
            height: 100vh;
            background-color: #f5f5f5;
        }

        .header {
            background-color: #2c3e50;
            color: white;
            padding: 5px 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .header h1 {
            font-size: 24px;
            font-weight: 500;
        }

        .toolbar {
            background-color: #34495e;
            padding: 10px 0px;
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .toolbar input {
            padding: 8px 12px;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            font-size: 14px;
            min-width: 200px;
        }

        .toolbar button {
            padding: 8px 16px;
            background-color: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .toolbar button:hover {
            background-color: #2980b9;
        }

        .toolbar button.replace-btn {
            background-color: #e74c3c;
        }

        .toolbar button.replace-btn:hover {
            background-color: #c0392b;
        }

        .toolbar button.replace-all-btn {
            background-color: #e67e22;
        }

        .toolbar button.replace-all-btn:hover {
            background-color: #d35400;
        }

        .toolbar button.clear-btn {
            background-color: #95a5a6;
        }

        .toolbar button.clear-btn:hover {
            background-color: #7f8c8d;
        }

        .editor-container {
            flex: 1;
            padding: 5px;
            overflow: hidden;
        }

        #editor {
            width: 100%;
            height: 70vh;
            padding: 5px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
            font-size: 14px;
            line-height: 1.6;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            resize: none;
            background-color: white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }

        #editor:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }

        .status-bar {
            background-color: #ecf0f1;
            padding: 8px 20px;
            font-size: 12px;
            color: #7f8c8d;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #bdc3c7;
        }

        .search-info {
            color: #27ae60;
            font-weight: 500;
        }

        .toolbar-group {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .toolbar label {
            color: #ecf0f1;
            font-size: 14px;
        }
</style>


<script>
        // DOM要素の取得
        const editor = document.getElementById('editor');
        const searchInput = document.getElementById('searchInput');
        const replaceInput = document.getElementById('replaceInput');
        const searchBtn = document.getElementById('searchBtn');
        const replaceBtn = document.getElementById('replaceBtn');
        const replaceAllBtn = document.getElementById('replaceAllBtn');
        const clearBtn = document.getElementById('clearBtn');
        const statusText = document.getElementById('statusText');
        const searchInfo = document.getElementById('searchInfo');

        // WebStorageのキー
        const STORAGE_KEY = 'webEditorContent';

        // 検索状態の管理
        let currentSearchIndex = -1;
        let searchMatches = [];

        // ページ読み込み時にWebStorageからデータを復元
        window.addEventListener('load', () => {
            const savedContent = localStorage.getItem(STORAGE_KEY);
            if (savedContent) {
                editor.value = savedContent;
                updateStatus('保存済みの内容を読み込みました');
            }
        });

        // エディタの内容が変更されたら自動保存
        let saveTimeout;
        editor.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            updateStatus('保存中...');

            saveTimeout = setTimeout(() => {
                localStorage.setItem(STORAGE_KEY, editor.value);
                updateStatus('自動保存済み');
            }, 1000); // 1秒後に保存
        });

        // ステータス更新
        function updateStatus(message) {
            statusText.textContent = message;
        }

        // 検索情報の更新
        function updateSearchInfo(message) {
            searchInfo.textContent = message;
        }

        // 検索機能
        function performSearch() {
            const searchText = searchInput.value;
            if (!searchText) {
                alert('検索する文字列を入力してください');
                return;
            }

            const content = editor.value;
            searchMatches = [];
            let index = 0;

            // すべてのマッチを見つける
            while ((index = content.indexOf(searchText, index)) !== -1) {
                searchMatches.push(index);
                index += searchText.length;
            }

            if (searchMatches.length === 0) {
                updateSearchInfo('見つかりませんでした');
                currentSearchIndex = -1;
                return;
            }

            // 最初のマッチにジャンプ
            currentSearchIndex = 0;
            highlightMatch(searchText);
            updateSearchInfo(`${searchMatches.length}件見つかりました (${currentSearchIndex + 1}/${searchMatches.length})`);
        }

        // マッチをハイライト
        function highlightMatch(searchText) {
            if (currentSearchIndex >= 0 && currentSearchIndex < searchMatches.length) {
                const start = searchMatches[currentSearchIndex];
                editor.focus();
                editor.setSelectionRange(start, start + searchText.length);
                editor.scrollTop = editor.scrollHeight * (start / editor.value.length);
            }
        }

        // 次の検索結果へ移動
        function nextMatch() {
            const searchText = searchInput.value;
            if (searchMatches.length === 0) {
                performSearch();
                return;
            }

            currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
            highlightMatch(searchText);
            updateSearchInfo(`${searchMatches.length}件見つかりました (${currentSearchIndex + 1}/${searchMatches.length})`);
        }

        // 置換機能（現在選択中のもの）
        function replaceCurrentMatch() {
            const searchText = searchInput.value;
            const replaceText = replaceInput.value;

            if (!searchText) {
                alert('検索する文字列を入力してください');
                return;
            }

            if (searchMatches.length === 0) {
                performSearch();
                if (searchMatches.length === 0) return;
            }

            if (currentSearchIndex >= 0 && currentSearchIndex < searchMatches.length) {
                const start = searchMatches[currentSearchIndex];
                const end = start + searchText.length;
                const content = editor.value;

                editor.value = content.substring(0, start) + replaceText + content.substring(end);

                // WebStorageに保存
                localStorage.setItem(STORAGE_KEY, editor.value);
                updateStatus('置換して保存しました');

                // 検索結果を再計算
                performSearch();
            }
        }

        // すべて置換
        function replaceAll() {
            const searchText = searchInput.value;
            const replaceText = replaceInput.value;

            if (!searchText) {
                alert('検索する文字列を入力してください');
                return;
            }

            const content = editor.value;
            const regex = new RegExp(escapeRegExp(searchText), 'g');
            const matches = content.match(regex);

            if (!matches) {
                alert('置換する文字列が見つかりませんでした');
                return;
            }

            if (confirm(`${matches.length}件の文字列を置換しますか？`)) {
                editor.value = content.replace(regex, replaceText);

                // WebStorageに保存
                localStorage.setItem(STORAGE_KEY, editor.value);
                updateStatus('すべて置換して保存しました');
                updateSearchInfo(`${matches.length}件を置換しました`);

                // 検索状態をリセット
                searchMatches = [];
                currentSearchIndex = -1;
            }
        }

        // 正規表現の特殊文字をエスケープ
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // エディタをクリア
        function clearEditor() {
            if (editor.value && !confirm('エディタの内容をすべて削除しますか？')) {
                return;
            }

            editor.value = '';
            localStorage.setItem(STORAGE_KEY, '');
            updateStatus('クリアしました');
            updateSearchInfo('');
            searchMatches = [];
            currentSearchIndex = -1;
        }

        // イベントリスナーの設定
        searchBtn.addEventListener('click', performSearch);
        replaceBtn.addEventListener('click', replaceCurrentMatch);
        replaceAllBtn.addEventListener('click', replaceAll);
        clearBtn.addEventListener('click', clearEditor);

        // Enterキーで検索
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (searchMatches.length > 0) {
                    nextMatch();
                } else {
                    performSearch();
                }
            }
        });

        // Enterキーで置換
        replaceInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                replaceCurrentMatch();
            }
        });

        // ページを離れる前に最終保存
        window.addEventListener('beforeunload', () => {
            localStorage.setItem(STORAGE_KEY, editor.value);
        });
</script>

