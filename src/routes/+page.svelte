<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto, invalidateAll } from '$app/navigation';
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';
    import Bookshelf from '$lib/components/Bookshelf.svelte';

    let { data } = $props();

    // Initialize Supabase browser client for logout action
    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
        } else {
            window.location.reload();
        }
    }

    // Prompt and Selection states
    let prompt = $state('');
    let isSubmitting = $state(false);
    let selectedBookId = $state('');
    let selectedMode = $state('book'); // 'book' or 'card'
    let textareaEl = $state<HTMLTextAreaElement | null>(null);
    let formEl = $state<HTMLFormElement | null>(null);

    // Attached files state
    interface AttachedFile {
        id: string;
        type: 'image' | 'text';
        name: string;
        url?: string;
        content?: string;
        status: 'uploading' | 'loading' | 'success' | 'error';
        error?: string;
    }
    let attachedFiles = $state<AttachedFile[]>([]);
    let fileInputEl = $state<HTMLInputElement | null>(null);

    async function processAndUploadImage(file: File): Promise<string> {
        const compressedBlob = await compressImage(file);
        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        
        const cleanName = file.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fileName = `${crypto.randomUUID()}_${cleanName}.webp`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('HyperCardBookBucket')
            .upload(filePath, compressedBlob, {
                contentType: 'image/webp',
                cacheControl: '3600'
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
            .from('HyperCardBookBucket')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    }

    async function handleAttachedFilesChange(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        
        const files = Array.from(input.files);
        
        for (const file of files) {
            const id = crypto.randomUUID();
            const isImage = file.type.startsWith('image/');
            const type = isImage ? 'image' : 'text';
            
            const newAttached: AttachedFile = {
                id,
                type,
                name: file.name,
                status: isImage ? 'uploading' : 'loading'
            };
            attachedFiles = [...attachedFiles, newAttached];
            
            if (isImage) {
                try {
                    const url = await processAndUploadImage(file);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'success', url } : f
                    );
                } catch (err: any) {
                    console.error('Attached image upload failed:', err);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'error', error: err.message || 'Upload failed' } : f
                    );
                }
            } else {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target?.result as string;
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'success', content } : f
                    );
                };
                reader.onerror = (err) => {
                    console.error('File read error:', err);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'error', error: 'Failed to read file' } : f
                    );
                };
                reader.readAsText(file);
            }
        }
        
        input.value = '';
    }

    async function removeAttachedFile(id: string) {
        const fileToRemove = attachedFiles.find(f => f.id === id);
        if (!fileToRemove) return;
        
        attachedFiles = attachedFiles.filter(f => f.id !== id);
        
        if (fileToRemove.type === 'image' && fileToRemove.status === 'success' && fileToRemove.url) {
            try {
                const urlParts = fileToRemove.url.split('/HyperCardBookBucket/');
                if (urlParts.length > 1) {
                    const filePath = decodeURIComponent(urlParts[1]);
                    await supabase.storage
                        .from('HyperCardBookBucket')
                        .remove([filePath]);
                }
            } catch (err) {
                console.error('Failed to delete file from storage on removal:', err);
            }
        }
    }

    // Bookshelf theme state
    let uiTheme = $state('dark');

    onMount(() => {
        const saved = localStorage.getItem('shelf-theme');
        if (saved) {
            uiTheme = saved;
        }
    });

    function toggleTheme() {
        uiTheme = uiTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('shelf-theme', uiTheme);
    }

    // Handle prompt selection context toggles
    function handlePromptSelect(book: any) {
        if (selectedBookId === book.id) {
            selectedBookId = '';
        } else {
            selectedBookId = book.id;
            selectedMode = book.isCard ? 'card' : 'book';
            tick().then(() => {
                if (textareaEl) {
                    textareaEl.focus();
                }
            });
        }
    }

    // Submit handler
    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!prompt.trim() || isSubmitting) return;

        const hasPending = attachedFiles.some(f => f.status === 'uploading' || f.status === 'loading');
        if (hasPending) {
            alert('ファイルの処理が完了するまでお待ちください。');
            return;
        }

        const successFiles = attachedFiles.filter(f => f.status === 'success');
        const images = successFiles.filter(f => f.type === 'image');
        const texts = successFiles.filter(f => f.type === 'text');

        let finalPrompt = prompt.trim();
        if (successFiles.length > 0) {
            finalPrompt += '\n\n<!-- ATTACHMENTS_START -->';
            if (images.length > 0) {
                finalPrompt += '\n### 添付画像\n' + images.map(img => `![${img.name}](${img.url})`).join('\n');
            }
            if (texts.length > 0) {
                finalPrompt += '\n### 添付テキスト\n' + texts.map(txt => `📄 ${txt.name}\n\`\`\`content\n${txt.content}\n\`\`\``).join('\n\n');
            }
            finalPrompt += '\n<!-- ATTACHMENTS_END -->';
        }

        isSubmitting = true;
        try {
            sessionStorage.setItem('workspace_init_prompt', finalPrompt);
        } catch (err) {
            console.error('Failed to store prompt in sessionStorage:', err);
        }
        let targetUrl = `/workspace?mode=${selectedMode}`;
        if (selectedBookId) {
            targetUrl += `&id=${selectedBookId}`;
        }
        goto(targetUrl);
    }

    // Edit handler
    function handleEditBook(book: any) {
        goto(`/workspace?id=${book.id}`);
    }

    // Delete handler
    async function handleDeleteBook(book: any) {
        if (!confirm(`Are you sure you want to delete "${book.title}"?`)) return;

        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: book.id })
            });

            if (response.ok) {
                await invalidateAll();
                if (selectedBookId === book.id) {
                    selectedBookId = '';
                }
            } else {
                const errData = await response.json();
                alert(`Failed to delete: ${errData.error}`);
            }
        } catch (err) {
            console.error('Delete book error:', err);
            alert('An error occurred during deletion.');
        }
    }

    // Download handler
    async function handleDownloadBook(book: any) {
        try {
            const { data, error } = await supabase
                .from('books')
                .select('markdown_content')
                .eq('id', book.id)
                .single();

            if (error || !data?.markdown_content) {
                alert('Failed to find download data.');
                return;
            }

            const blob = new Blob([data.markdown_content], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${book.title || 'book'}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download book error:', err);
            alert('An error occurred during download.');
        }
    }

    // Settings modal states
    let showSettingsModal = $state(false);
    let settingsActiveTab = $state('profile'); // 'profile', 'hypercardbook', 'customprompt'
    
    // User profile states
    let profileFullName = $state('');
    let profileNickname = $state('');
    let profileAvatarUrl = $state('');
    let profileAuthorBio = $state('');
    
    // Config files states
    let profileHypercardbookMd = $state('');
    let profileCustompromptMd = $state('');
    
    // Upload state in profile
    let isUploadingAvatar = $state(false);
    let avatarFileInputEl = $state<HTMLInputElement | null>(null);

    // Account deletion workflow states
    let deleteStep = $state('none'); // 'none', 'warn', 'credentials', 'loading'
    let deleteConfirmEmail = $state('');
    let deleteConfirmPassword = $state('');
    let deleteErrorMsg = $state('');

    // Default configuration constants
    const DEFAULT_HYPERCARDBOOK_MD = `# HyperCardBook設定
## 全般
- language: ja (日本語)
- default_theme: dark`;

    const DEFAULT_CUSTOMPROMPT_MD = `# カスタムプロンプト指示
- 丁寧な日本語で解説してください。
- 専門用語には簡単な説明を添えてください。`;

    function openSettingsModal() {
        if (!data.session?.user) return;
        const metadata = data.session.user.user_metadata || {};
        
        profileFullName = metadata.full_name || metadata.name || '';
        profileNickname = metadata.nickname || '';
        profileAvatarUrl = metadata.avatar_url || '';
        profileAuthorBio = metadata.author_bio || '';
        
        profileHypercardbookMd = metadata.hypercardbook_md || DEFAULT_HYPERCARDBOOK_MD;
        profileCustompromptMd = metadata.customprompt_md || DEFAULT_CUSTOMPROMPT_MD;
        
        settingsActiveTab = 'profile';
        deleteStep = 'none';
        deleteConfirmEmail = '';
        deleteConfirmPassword = '';
        deleteErrorMsg = '';
        showSettingsModal = true;
    }

    let isSavingSettings = $state(false);
    async function saveSettings() {
        if (isSavingSettings) return;
        isSavingSettings = true;
        
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    full_name: profileFullName,
                    nickname: profileNickname,
                    avatar_url: profileAvatarUrl,
                    author_bio: profileAuthorBio,
                    hypercardbook_md: profileHypercardbookMd,
                    customprompt_md: profileCustompromptMd
                }
            });
            
            if (updateError) throw updateError;
            
            showSettingsModal = false;
            await invalidateAll();
            alert('環境設定を保存しました。');
        } catch (err: any) {
            console.error('Failed to save settings:', err);
            alert(`設定の保存に失敗しました: ${err.message || err}`);
        } finally {
            isSavingSettings = false;
        }
    }

    async function handleAvatarUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];
        isUploadingAvatar = true;
        
        try {
            const compressedBlob = await compressImage(file);
            const fileExt = 'webp';
            const fileName = `avatar_${data.currentUserId || 'guest'}_${Date.now()}.${fileExt}`;
            const filePath = `${data.currentUserId || 'guest'}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('HyperCardBookBucket')
                .upload(filePath, compressedBlob, {
                    contentType: 'image/webp',
                    upsert: true
                });
                
            if (uploadError) throw uploadError;
            
            const { data: urlData } = supabase.storage
                .from('HyperCardBookBucket')
                .getPublicUrl(filePath);
                
            profileAvatarUrl = urlData.publicUrl;
        } catch (err: any) {
            console.error('Avatar upload failed:', err);
            alert(`アバター画像のアップロードに失敗しました: ${err.message || err}`);
        } finally {
            isUploadingAvatar = false;
            input.value = '';
        }
    }

    function startAccountDelete() {
        deleteStep = 'warn';
    }
    
    function acceptDeleteWarning() {
        deleteStep = 'credentials';
    }
    
    async function executeAccountDelete() {
        if (!deleteConfirmEmail.trim() || !deleteConfirmPassword.trim()) return;
        
        if (!confirm('Are you sure you want to permanently delete your account? This action is not reversible.')) {
            return;
        }
        
        deleteStep = 'loading';
        deleteErrorMsg = '';
        
        try {
            const response = await fetch('/api/user/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: deleteConfirmEmail,
                    password: deleteConfirmPassword
                })
            });
            
            const resData = await response.json();
            
            if (response.ok) {
                alert('アカウントが正常に削除されました。ご利用ありがとうございました。');
                showSettingsModal = false;
                window.location.href = '/';
            } else {
                throw new Error(resData.error || 'Failed to delete account.');
            }
        } catch (err: any) {
            console.error('Delete account failed:', err);
            deleteErrorMsg = err.message || 'An error occurred during account deletion.';
            deleteStep = 'credentials';
        }
    }

    function compressImage(file: File): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                }, 'image/webp', 0.82);
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
        });
    }
</script>

<div class="landing-container" data-theme={uiTheme}>
    <!-- Theme switch and login/logout buttons at top right -->
    <div class="theme-switch-container">
        {#if data.session?.user}
            <div 
                class="user-profile clickable-profile" 
                onclick={openSettingsModal}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { openSettingsModal(); } }}
                role="button"
                tabindex="0"
                title="環境設定を開く"
            >
                {#if data.session.user.user_metadata?.avatar_url}
                    <img 
                        src={data.session.user.user_metadata.avatar_url} 
                        alt="User Avatar" 
                        class="user-avatar" 
                        referrerpolicy="no-referrer"
                    />
                {/if}
                <span class="user-name">
                    {data.session.user.user_metadata?.full_name || data.session.user.user_metadata?.name || 'User'}
                </span>
            </div>
            <button class="theme-switch logout-btn" onclick={handleLogout}>
                Logout
            </button>
        {:else}
            <button class="theme-switch login-btn" onclick={() => goto('/login')}>
                Login
            </button>
        {/if}
        <button class="theme-switch" onclick={toggleTheme}>
            {uiTheme === 'dark' ? '☀️' : '🌙'}
        </button>
    </div>

    <!-- Prompt input box repositioned slightly higher -->
    <div class="landing-panel">
        <h1 class="title">HyperCardBook</h1>
        <p class="subtitle">HyperCardBook is an AI for generating Markdown ebooks.</p>

        <form bind:this={formEl} onsubmit={handleSubmit} class="prompt-form">
            <div class="prompt-textarea-wrapper">
                <textarea
                    bind:this={textareaEl}
                    bind:value={prompt}
                    placeholder="Please enter the prompt to create the book."
                    required
                    rows="4"
                    disabled={!data.currentUserId || isSubmitting}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            if (prompt.trim() || attachedFiles.length > 0) {
                                formEl?.requestSubmit();
                            }
                        }
                    }}
                ></textarea>
                
                <!-- Hidden file input for attachments -->
                <input
                    type="file"
                    accept="image/*,text/plain,text/markdown,.md,.txt"
                    multiple
                    bind:this={fileInputEl}
                    onchange={handleAttachedFilesChange}
                    class="hidden-file-input"
                />

                <!-- Attached files preview container inside the wrapper -->
                {#if attachedFiles.length > 0}
                    <div class="attached-files-preview-bar">
                        {#each attachedFiles as file}
                            <div class="attached-file-badge" class:error={file.status === 'error'}>
                                {#if file.status === 'uploading' || file.status === 'loading'}
                                    <div class="badge-spinner"></div>
                                {:else if file.type === 'image' && file.url}
                                    <img src={file.url} alt={file.name} class="badge-thumb" />
                                {:else}
                                    <span class="badge-icon">📄</span>
                                {/if}
                                <span class="badge-name" title={file.name}>{file.name}</span>
                                <button
                                    type="button"
                                    class="badge-remove-btn"
                                    onclick={() => removeAttachedFile(file.id)}
                                    title="Remove attachment"
                                >
                                    ✕
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}

                <div class="prompt-bottom-row">
                    <div class="prompt-bottom-left">
                        <button
                            type="button"
                            class="attach-trigger-btn"
                            onclick={() => fileInputEl?.click()}
                            disabled={!data.currentUserId || isSubmitting}
                            title="Attach files (Image/Text)"
                        >
                            ➕
                        </button>
                        <div class="mode-toggle-container">
                            <label class="mode-toggle-label">
                                <input type="radio" name="mode" value="card" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                                <span>Card</span>
                            </label>
                            <label class="mode-toggle-label">
                                <input type="radio" name="mode" value="book" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                                <span>Book</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" class="submit-btn" disabled={!data.currentUserId || isSubmitting || (!prompt.trim() && attachedFiles.length === 0)}>
                        {#if isSubmitting}
                            <div class="spinner"></div>
                        {:else}
                            Run ⌘↩︎
                        {/if}
                    </button>
                </div>
            </div>
        </form>
    </div>

    <!-- 3D wooden bookshelf displayed directly on the landing page -->
    <div class="bookshelf-section">
        {#if !data.books || data.books.length === 0}
            <div class="empty-shelf">
                <p>本棚にはまだ本がありません。プロンプトを入力して生成してください。</p>
            </div>
        {:else}
            <Bookshelf
                books={data.books}
                currentUserId={data.currentUserId}
                showActions={true}
                bind:selectedBookId={selectedBookId}
                onPromptSelect={handlePromptSelect}
                onEditBook={handleEditBook}
                onDeleteBook={handleDeleteBook}
                onDownloadBook={handleDownloadBook}
                fromPage="home"
            />
        {/if}
    </div>

    {#if showSettingsModal}
        <div class="modal-overlay" onclick={() => showSettingsModal = false} onkeydown={(e) => e.key === 'Escape' && (showSettingsModal = false)} role="presentation">
            <div class="settings-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="modal-header">
                    <h2>環境設定 (Settings)</h2>
                    <button class="close-btn" onclick={() => showSettingsModal = false}>✕</button>
                </div>
                
                <div class="modal-tabs">
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'profile'} 
                        onclick={() => settingsActiveTab = 'profile'}
                    >
                        プロフィール (Profile)
                    </button>
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'hypercardbook'} 
                        onclick={() => settingsActiveTab = 'hypercardbook'}
                    >
                        hypercardbook.md
                    </button>
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'customprompt'} 
                        onclick={() => settingsActiveTab = 'customprompt'}
                    >
                        customprompt.md
                    </button>
                </div>
                
                <div class="modal-body">
                    {#if settingsActiveTab === 'profile'}
                        <div class="tab-pane">
                            <div class="form-group">
                                <label for="setting-avatar">プロフィール画像 (Avatar)</label>
                                <div class="avatar-edit-container">
                                    <img src={profileAvatarUrl || '/default-avatar.png'} alt="Preview" class="avatar-preview" />
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        bind:this={avatarFileInputEl} 
                                        onchange={handleAvatarUpload} 
                                        class="hidden-file-input" 
                                    />
                                    <button 
                                        type="button" 
                                        class="avatar-upload-btn" 
                                        onclick={() => avatarFileInputEl?.click()}
                                        disabled={isUploadingAvatar}
                                    >
                                        {isUploadingAvatar ? 'Uploading...' : '画像を変更'}
                                    </button>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-name">名前 (Full Name)</label>
                                <input type="text" id="setting-name" bind:value={profileFullName} placeholder="ユーザー名" />
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-nickname">ニックネーム (Nickname) *チャットで利用</label>
                                <input type="text" id="setting-nickname" bind:value={profileNickname} placeholder="ニックネームを入力" />
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-bio">著者紹介 (Biography) *Bookで使用</label>
                                <textarea id="setting-bio" bind:value={profileAuthorBio} rows="4" placeholder="著者紹介を入力してください。空欄の場合、著者紹介ページは自動生成されません。"></textarea>
                            </div>
                            
                            <div class="danger-zone">
                                <h3>アカウント削除 (Delete Account)</h3>
                                {#if deleteStep === 'none'}
                                    <button type="button" class="danger-btn" onclick={startAccountDelete}>
                                        アカウントを削除する
                                    </button>
                                {:else if deleteStep === 'warn'}
                                    <div class="delete-warning-box">
                                        <p class="warning-text">⚠️ Warning: This action is permanent and cannot be undone. All your books and profile data will be deleted forever.</p>
                                        <button type="button" class="warn-ok-btn" onclick={acceptDeleteWarning}>
                                            OK
                                        </button>
                                    </div>
                                {:else if deleteStep === 'credentials' || deleteStep === 'loading'}
                                    <div class="delete-credentials-box">
                                        <p>再認証のため、現在のメールアドレスとパスワードを入力してください。</p>
                                        {#if deleteErrorMsg}
                                            <p class="error-msg">{deleteErrorMsg}</p>
                                        {/if}
                                        <div class="form-group">
                                            <input 
                                                type="email" 
                                                bind:value={deleteConfirmEmail} 
                                                placeholder="メールアドレス (Email)" 
                                                disabled={deleteStep === 'loading'} 
                                            />
                                        </div>
                                        <div class="form-group">
                                            <input 
                                                type="password" 
                                                bind:value={deleteConfirmPassword} 
                                                placeholder="パスワード (Password)" 
                                                disabled={deleteStep === 'loading'} 
                                            />
                                        </div>
                                        <div class="delete-actions">
                                            <button 
                                                type="button" 
                                                class="delete-cancel-btn" 
                                                onclick={() => deleteStep = 'none'}
                                                disabled={deleteStep === 'loading'}
                                            >
                                                キャンセル
                                            </button>
                                            <button 
                                                type="button" 
                                                class="delete-execute-btn" 
                                                onclick={executeAccountDelete}
                                                disabled={!deleteConfirmEmail.trim() || !deleteConfirmPassword.trim() || deleteStep === 'loading'}
                                            >
                                                {deleteStep === 'loading' ? 'Deleting...' : 'アカウントを完全に削除'}
                                            </button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else if settingsActiveTab === 'hypercardbook'}
                        <div class="tab-pane">
                            <div class="editor-header">
                                <p>AIによる書籍生成時のフォーマットや全般設定を定義します。</p>
                                <button type="button" class="reset-default-btn" onclick={() => profileHypercardbookMd = DEFAULT_HYPERCARDBOOK_MD}>デフォルト値に戻す</button>
                            </div>
                            <textarea class="md-editor-textarea" bind:value={profileHypercardbookMd} rows="15"></textarea>
                        </div>
                    {:else if settingsActiveTab === 'customprompt'}
                        <div class="tab-pane">
                            <div class="editor-header">
                                <p>AI生成時のキャラクター性、文体、カスタマイズ指示文を定義します。</p>
                                <button type="button" class="reset-default-btn" onclick={() => profileCustompromptMd = DEFAULT_CUSTOMPROMPT_MD}>デフォルト値に戻す</button>
                            </div>
                            <textarea class="md-editor-textarea" bind:value={profileCustompromptMd} rows="15"></textarea>
                        </div>
                    {/if}
                </div>
                
                <div class="modal-footer">
                    <button type="button" class="cancel-btn" onclick={() => showSettingsModal = false}>キャンセル</button>
                    <button type="button" class="save-btn" onclick={saveSettings} disabled={isSavingSettings}>
                        {isSavingSettings ? '保存中...' : '設定を保存'}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .landing-container {
        --bg-color: #0b0c10;
        --shelf-back-color: #1e130c;
        --text-color: #f5ebe0;
        --shelf-wood-dark: #1f1007;
        --shelf-wood-light: #3a1f0e;
        --shelf-wood-top: #542f17;
        --shelf-shadow: rgba(0, 0, 0, 0.85);
        --card-bg: rgba(255, 255, 255, 0.05);
        --card-border: rgba(255, 255, 255, 0.1);
        --book-cover-bg: #161616;

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        width: 100vw;
        min-height: 100vh;
        background-color: var(--bg-color);
        transition: background 0.4s, color 0.4s;
        box-sizing: border-box;
        overflow-x: hidden;
        padding-bottom: 60px;
    }

    .landing-container[data-theme="light"] {
        --bg-color: #f4eae1;
        --shelf-back-color: #e6ccb2;
        --text-color: #3d2516;
        --shelf-wood-dark: #5c3a21;
        --shelf-wood-light: #8b5a2b;
        --shelf-wood-top: #b07d4f;
        --shelf-shadow: rgba(61, 37, 22, 0.3);
        --card-bg: rgba(0, 0, 0, 0.03);
        --card-border: rgba(0, 0, 0, 0.08);
        --book-cover-bg: #1c1c1c;
    }

    /* --- Theme Switch Button --- */
    .theme-switch-container {
        position: absolute; top: 20px; right: 20px;
        z-index: 1000;
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .user-profile {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        padding: 4px 12px 4px 4px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
    }

    .user-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
    }

    .user-name {
        font-size: 11px;
        color: var(--text-color);
        font-weight: 600;
        max-width: 100px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: system-ui, sans-serif;
    }

    .theme-switch {
        padding: 8px 16px; border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--card-bg); color: var(--text-color);
        cursor: pointer; font-size: 12px; transition: 0.3s;
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }
    .theme-switch:hover {
        opacity: 0.8; transform: scale(1.05);
    }

    /* --- Prompt Input Box --- */
    .landing-panel {
        width: 90%;
        max-width: 500px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        text-align: center;
        animation: fadeIn 0.5s ease-out forwards;
        margin-top: 60px;
        margin-bottom: 40px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .landing-panel {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }

    .title {
        font-family: 'Outfit', sans-serif;
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0 0 8px 0;
        color: var(--text-color);
    }

    .subtitle {
        font-size: 14px;
        color: var(--text-color);
        opacity: 0.6;
        margin: 0 0 30px 0;
    }

    .prompt-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .hidden-file-input {
        display: none !important;
    }

    textarea {
        width: 100%;
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
        outline: none;
        box-sizing: border-box;
        padding: 0;
    }

    .landing-container[data-theme="light"] textarea {
        background: transparent;
        border: none;
        color: #3d2516;
    }

    textarea:focus {
        outline: none;
    }

    .prompt-textarea-wrapper {
        width: 100%;
        display: flex;
        flex-direction: column;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 14px;
        gap: 12px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .prompt-textarea-wrapper {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .prompt-bottom-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .mode-toggle-container {
        display: flex;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 2px;
        gap: 2px;
        z-index: 10;
    }

    .landing-container[data-theme="light"] .mode-toggle-container {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .mode-toggle-label {
        display: flex;
        align-items: center;
        cursor: pointer;
    }

    .mode-toggle-label input {
        display: none;
    }

    .mode-toggle-label span {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 16px;
        color: #9ca3af;
        transition: all 0.2s;
        font-family: 'Outfit', sans-serif;
    }

    .mode-toggle-label input:checked + span {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
    }

    .submit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 16px;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        border-radius: 8px;
        color: #ffffff;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .submit-btn:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .submit-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    /* --- Bookshelf Section --- */
    .bookshelf-section {
        width: 90%;
        max-width: 960px;
        display: flex;
        flex-direction: column;
        align-items: center;
        box-sizing: border-box;
    }

    .empty-shelf {
        font-size: 16px;
        opacity: 0.7;
        text-align: center;
        padding: 40px;
        color: var(--text-color);
    }

    .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .clickable-profile {
        cursor: pointer;
        transition: transform 0.2s, background-color 0.2s;
    }
    .clickable-profile:hover {
        background-color: var(--card-border);
        transform: scale(1.02);
    }
    
    /* --- Modal CSS --- */
    .modal-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(4px);
        box-sizing: border-box;
    }
    
    .settings-modal-card {
        background: #12131c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 90%;
        max-width: 600px;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #f5ebe0;
        font-family: system-ui, sans-serif;
        overflow: hidden;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .settings-modal-card {
        background: #ebdcd0;
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }
    
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-header {
        border-bottom-color: rgba(61, 37, 22, 0.1);
    }
    .modal-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        font-family: 'Outfit', sans-serif;
    }
    .close-btn {
        background: none;
        border: none;
        color: inherit;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.7;
    }
    .close-btn:hover {
        opacity: 1;
    }
    
    .modal-tabs {
        display: flex;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.15);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-tabs {
        border-bottom-color: rgba(61, 37, 22, 0.1);
        background: rgba(61, 37, 22, 0.03);
    }
    .tab-link {
        flex: 1;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: inherit;
        padding: 12px 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        opacity: 0.6;
        transition: 0.2s;
        text-align: center;
    }
    .tab-link:hover {
        opacity: 0.9;
    }
    .tab-link.active {
        opacity: 1;
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
    }
    
    .modal-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
        box-sizing: border-box;
    }
    
    .tab-pane {
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
    }
    
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-sizing: border-box;
        text-align: left;
    }
    .form-group label {
        font-size: 12px;
        font-weight: 600;
        opacity: 0.8;
    }
    .form-group input[type="text"],
    .form-group input[type="email"],
    .form-group input[type="password"],
    .form-group textarea {
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 10px 12px;
        color: inherit;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
        width: 100%;
    }
    .landing-container[data-theme="light"] .form-group input[type="text"],
    .landing-container[data-theme="light"] .form-group input[type="email"],
    .landing-container[data-theme="light"] .form-group input[type="password"],
    .landing-container[data-theme="light"] .form-group textarea {
        background: rgba(255,255,255,0.5);
        border-color: rgba(61, 37, 22, 0.15);
    }
    .form-group input:focus, .form-group textarea:focus {
        border-color: #8b5cf6;
    }
    
    .avatar-edit-container {
        display: flex;
        align-items: center;
        gap: 16px;
        box-sizing: border-box;
    }
    .avatar-preview {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(255,255,255,0.1);
    }
    .avatar-upload-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
    }
    .avatar-upload-btn:hover {
        background: rgba(255,255,255,0.1);
    }
    
    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        opacity: 0.8;
        box-sizing: border-box;
    }
    .reset-default-btn {
        background: none;
        border: none;
        color: #8b5cf6;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    }
    .reset-default-btn:hover {
        text-decoration: underline;
    }
    .md-editor-textarea {
        font-family: monospace;
        font-size: 13px;
        line-height: 1.5;
        resize: vertical;
    }
    
    .danger-zone {
        border-top: 1px solid rgba(255,255,255,0.08);
        margin-top: 12px;
        padding-top: 16px;
        box-sizing: border-box;
        text-align: left;
    }
    .landing-container[data-theme="light"] .danger-zone {
        border-top-color: rgba(61, 37, 22, 0.1);
    }
    .danger-zone h3 {
        color: #ef4444;
        font-size: 14px;
        margin: 0 0 10px 0;
        font-weight: 700;
    }
    .danger-btn {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .danger-btn:hover {
        background: #ef4444;
        color: #ffffff;
    }
    .landing-container[data-theme="light"] .danger-btn {
        color: #b91c1c;
        border-color: rgba(239, 68, 68, 0.3);
    }
    .landing-container[data-theme="light"] .danger-btn:hover {
        background: #ef4444;
        color: #ffffff;
    }
    
    .delete-warning-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
    }
    .warning-text {
        color: #fca5a5;
        font-size: 13px;
        line-height: 1.4;
        margin: 0;
    }
    .landing-container[data-theme="light"] .warning-text {
        color: #b91c1c;
    }
    .warn-ok-btn {
        align-self: flex-end;
        background: #ef4444;
        border: none;
        color: white;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    
    .delete-credentials-box {
        background: rgba(0,0,0,0.15);
        border: 1px solid rgba(255,255,255,0.05);
        padding: 16px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .delete-credentials-box {
        background: rgba(255,255,255,0.4);
        border-color: rgba(61, 37, 22, 0.1);
    }
    .delete-credentials-box p {
        margin: 0;
        font-size: 13px;
        opacity: 0.9;
    }
    .delete-credentials-box .error-msg {
        color: #fca5a5;
        font-weight: 600;
    }
    .landing-container[data-theme="light"] .delete-credentials-box .error-msg {
        color: #b91c1c;
    }
    .delete-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
        box-sizing: border-box;
    }
    .delete-cancel-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .delete-execute-btn {
        background: #ef4444;
        border: none;
        color: white;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .delete-execute-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    
    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.1);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-footer {
        border-top-color: rgba(61, 37, 22, 0.1);
        background: rgba(61, 37, 22, 0.02);
    }
    .modal-footer .cancel-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 20px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }
    .modal-footer .save-btn {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        color: white;
        border-radius: 20px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    .modal-footer .save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
    }

    .prompt-bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: 8px;
        box-sizing: border-box;
    }

    .attach-trigger-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffffff;
        border-radius: 8px;
        width: 36px;
        height: 36px;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .attach-trigger-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.25);
        transform: scale(1.05);
    }

    .attach-trigger-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Attached files preview bar */
    .attached-files-preview-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        margin-bottom: 12px;
        max-height: 120px;
        overflow-y: auto;
        width: 100%;
        box-sizing: border-box;
    }

    .attached-file-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.35);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: #cbd5e1;
        max-width: 180px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .attached-file-badge {
        background: rgba(139, 92, 246, 0.08);
        border-color: rgba(139, 92, 246, 0.25);
        color: #3d2516;
    }

    .attached-file-badge.error {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #fca5a5;
    }

    .badge-thumb {
        width: 20px;
        height: 20px;
        object-fit: cover;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .badge-icon {
        font-size: 14px;
    }

    .badge-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    .badge-remove-btn {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 0 2px;
        font-size: 11px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }

    .badge-remove-btn:hover {
        color: #ef4444;
    }

    .badge-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
</style>
