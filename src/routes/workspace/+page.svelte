<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import Book from '$lib/components/Book.svelte';
    import Card from '$lib/components/Card.svelte';
    import { marked } from 'marked';

    let { data } = $props();

    // Chat and Markdown states
    let markdown = $state('');
    let bookUuid = $state('');
    let activeTab = $state('preview'); // 'preview' or 'source'
    let mode = $state('book'); // 'book' or 'card'
    let replaceTargetIsCover = $state(false);
    let uiTheme = $state('dark');

    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';

    // Initialize Supabase browser client for image uploads
    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    // Media Panel states
    let showMediaPanel = $state(false);
    let mediaSearchQuery = $state('');
    let mediaSearchResults = $state<any[]>([]);
    let isSearchingMedia = $state(false);
    let isUploadingMedia = $state(false);
    let replaceTargetUrl = $state('');
    let replaceTargetAlt = $state('');
    let sourceEditorEl: HTMLTextAreaElement | null = $state(null);
    let uploadFileInput: HTMLInputElement | null = $state(null);
    let mediaSearchPage = $state(1);
    let totalMediaHits = $state(0);
    let isLoadingMoreMedia = $state(false);

    // Chat messages
    interface ChatMessage {
        role: 'user' | 'model';
        text: string;
    }
    let chatHistory: ChatMessage[] = $state([]);
    let currentInput = $state('');
    let isGenerating = $state(false);
    let errorMsg = $state('');

    // Monaco Editor states
    let useMonaco = $state(false);
    let monacoContainerEl = $state<HTMLDivElement | null>(null);
    let monacoEditor: any = null;

    function initMonaco() {
        if (!monacoContainerEl) return;
        
        if ((window as any).monaco) {
            createMonacoInstance();
        } else if ((window as any).require) {
            (window as any).require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
            (window as any).require(['vs/editor/editor.main'], function() {
                createMonacoInstance();
            });
        }
    }

    function createMonacoInstance() {
        if (!monacoContainerEl || !(window as any).monaco) return;
        
        if (monacoEditor) {
            monacoEditor.dispose();
        }

        monacoEditor = (window as any).monaco.editor.create(monacoContainerEl, {
            value: markdown,
            language: 'markdown',
            theme: 'vs-dark',
            lineNumbers: 'on',
            automaticLayout: true,
            readOnly: !data.session?.user,
            minimap: { enabled: false }
        });

        monacoEditor.onDidChangeModelContent(() => {
            markdown = monacoEditor.getValue();
        });
    }

    function toggleMonaco() {
        useMonaco = !useMonaco;
        if (useMonaco) {
            tick().then(() => {
                initMonaco();
            });
        } else {
            if (monacoEditor) {
                monacoEditor.dispose();
                monacoEditor = null;
            }
        }
    }

    // Effect to sync markdown state to Monaco Editor
    $effect(() => {
        if (monacoEditor && useMonaco) {
            const currentVal = monacoEditor.getValue();
            if (currentVal !== markdown) {
                monacoEditor.setValue(markdown);
            }
        }
    });

    // Effect to adjust layout when switching back to source tab
    $effect(() => {
        if (activeTab === 'source' && monacoEditor && useMonaco) {
            tick().then(() => {
                monacoEditor.layout();
            });
        }
    });

    // Effect to toggle read-only status based on user session
    $effect(() => {
        if (monacoEditor && useMonaco) {
            monacoEditor.updateOptions({ readOnly: !data.session?.user });
        }
    });

    // Clean up Monaco on unmount
    $effect(() => {
        return () => {
            if (monacoEditor) {
                monacoEditor.dispose();
                monacoEditor = null;
            }
        };
    });

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

    function parseUserMessage(text: string) {
        const parts = text.split('<!-- ATTACHMENTS_START -->');
        const body = parts[0].trim();
        const attachmentsSection = parts[1] || '';
        
        const images: { name: string; url: string }[] = [];
        const texts: { name: string; content: string }[] = [];
        
        if (attachmentsSection) {
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            let match;
            while ((match = imgRegex.exec(attachmentsSection)) !== null) {
                images.push({ name: match[1], url: match[2] });
            }
            
            const textRegex = /📄\s*(.*?)\n```content\n([\s\S]*?)\n```/g;
            while ((match = textRegex.exec(attachmentsSection)) !== null) {
                texts.push({ name: match[1], content: match[2] });
            }
        }
        
        return { body, images, texts };
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                if (currentInput.trim() && !isGenerating && data.session?.user) {
                    sendPrompt(currentInput);
                }
            } else {
                // Prevent implicit submission on plain Enter in textarea
                e.stopPropagation();
            }
        }
    }
    // Derived properties for Card layout preview
    let cardSlug = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'id') {
                    return parts.slice(1).join(':').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
                }
            }
        }
        return '';
    });

    let isExportingHtml = $state(false);

    let currentTitle = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'title') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return mode === 'card' ? 'Untitled Card' : 'Untitled Book';
    });

    let currentSlug = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'id') {
                    return parts.slice(1).join(':').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
                }
            }
        }
        return '';
    });

    function getEmbedUrl(url: string): string {
        if (!url) return '';
        if (url.includes('tiktok.com')) {
            const parts = url.split('/');
            const videoId = parts[parts.length - 1].split('?')[0];
            return `https://www.tiktok.com/embed/v2/${videoId}`;
        }
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            let videoId = '';
            if (url.includes('/shorts/')) {
                videoId = url.split('/shorts/')[1].split('?')[0];
            } else if (url.includes('v=')) {
                videoId = url.split('v=')[1].split('&')[0];
            } else if (url.includes('youtu.be/')) {
                videoId = url.split('youtu.be/')[1].split('?')[0];
            }
            return `https://www.youtube.com/embed/${videoId}`;
        }
        if (url.includes('instagram.com/reel/') || url.includes('instagram.com/p/')) {
            const keyword = url.includes('/reel/') ? '/reel/' : '/p/';
            const parts = url.split(keyword);
            const postId = parts[1].split('/')[0].split('?')[0];
            return `https://www.instagram.com/${keyword === '/reel/' ? 'reel' : 'p'}/${postId}/embed`;
        }
        return url;
    }

    function handleDownloadHtml() {
        const titleText = currentTitle;
        const slug = currentSlug || bookUuid || `export-${Date.now()}`;
        
        let standaloneHtml = '';

        if (mode === 'book') {
            const localOrigin = window.location.origin;
            standaloneHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleText}</title>
    <link rel="stylesheet" href="${localOrigin}/css/book-viewer.css">
</head>
<body>
    <div id="hyperbook-viewer"></div>
    <${'script'} type="text/markdown" id="book-markdown">
${markdown}
    </${'script'}>
    
    <!-- Marked and Mermaid load -->
    <${'script'} src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></${'script'}>
    <${'script'} src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></${'script'}>
    <${'script'} src="${localOrigin}/js/book-viewer.js"></${'script'}>
</body>
</html>`;
        } else {
            const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
            let styleMatch;
            let userStyles = '';
            while ((styleMatch = styleRegex.exec(markdown)) !== null) {
                userStyles += styleMatch[1] + '\n';
            }

            const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
            let scriptMatch;
            let userScripts = '';
            while ((scriptMatch = scriptRegex.exec(markdown)) !== null) {
                userScripts += scriptMatch[1] + '\n';
            }

            let cardBodyHtml = '';
            if (markdown) {
                const cleanMd = markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
                const lines = cleanMd.split('\n');
                const processedLines = lines.map(line => {
                    const trimmed = line.trim();
                    const videoMatch = trimmed.match(/^video:\s*(.*)/);
                    if (videoMatch) {
                        const videoUrl = videoMatch[1].trim();
                        return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
                    }
                    return line;
                });
                cardBodyHtml = marked.parse(processedLines.join('\n')) as string;
                cardBodyHtml = cardBodyHtml.replace(/src="books\//g, 'src="/books/');
            }

            standaloneHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleText}</title>
    <style>
        ${userStyles}
    </style>
</head>
<body>
    ${cardBodyHtml}
    
    <${'script'}>
        ${userScripts}
    </${'script'}>
</body>
</html>`;
        }

        const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleExportHtmlLink() {
        if (isExportingHtml) return;

        const newTab = window.open('', '_blank');
        if (!newTab) {
            alert('Popup blocker is active. Please allow popups for this site.');
            return;
        }

        newTab.document.write('<html><head><title>Exporting HTML...</title><style>body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4eae1; color: #333; } .loader { text-align: center; }</style></head><body><div class="loader"><h2>Generating standalone HTML...</h2><p>Please wait a moment.</p></div></body></html>');

        isExportingHtml = true;
        
        try {
            const response = await fetch('/api/export-html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    markdown,
                    id: bookUuid || currentSlug
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error ${response.status}`);
            }

            const dataRes = await response.json();
            if (dataRes.url) {
                newTab.location.href = dataRes.url;
            } else {
                throw new Error('No URL returned from export API');
            }
        } catch (err: any) {
            console.error('Export HTML failed:', err);
            newTab.close();
            alert(`Failed to export HTML: ${err.message || err}`);
        } finally {
            isExportingHtml = false;
        }
    }

    // Publishing & Unpublishing logic
    let confirmLegal = $state(false);
    let isPublishing = $state(false);
    let showPublishModal = $state(false);
    let showUnpublishModal = $state(false);

    let isPublic = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            let found = false;
            fmLines.forEach((line: string) => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'is_public' && v === 'true') {
                        found = true;
                    }
                }
            });
            return found;
        }
        return false;
    });

    function handlePublishBtnClick() {
        if (isPublic) {
            showUnpublishModal = true;
        } else {
            confirmLegal = false;
            showPublishModal = true;
        }
    }

    async function executePublish() {
        if (!confirmLegal || isPublishing) return;
        isPublishing = true;
        
        try {
            let updatedMarkdown = markdown;
            const nowIso = new Date().toISOString();
            
            const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                let fm = fmMatch[1];
                
                if (fm.includes('is_public:')) {
                    fm = fm.replace(/is_public:\s*(true|false)/g, 'is_public: true');
                } else {
                    fm += '\nis_public: true';
                }
                
                if (!fm.includes('published_at:')) {
                    fm += `\npublished_at: ${nowIso}`;
                }
                
                updatedMarkdown = updatedMarkdown.replace(/^---\s*[\s\S]*?\s*---/, `---\n${fm.trim()}\n---`);
            } else {
                updatedMarkdown = `---\nis_public: true\npublished_at: ${nowIso}\n---\n${markdown}`;
            }

            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    markdown: updatedMarkdown,
                    id: bookUuid,
                    is_public: true,
                    published_at: nowIso
                })
            });

            if (response.ok) {
                markdown = updatedMarkdown;
                showPublishModal = false;
            } else {
                const errData = await response.json();
                alert(`Publish failed: ${errData.error}`);
            }
        } catch (err: any) {
            console.error('Publish error:', err);
            alert(`Error occurred: ${err.message || err}`);
        } finally {
            isPublishing = false;
        }
    }

    async function executeUnpublish() {
        if (isPublishing) return;
        isPublishing = true;
        
        try {
            let updatedMarkdown = markdown;
            
            const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                let fm = fmMatch[1];
                
                if (fm.includes('is_public:')) {
                    fm = fm.replace(/is_public:\s*(true|false)/g, 'is_public: false');
                } else {
                    fm += '\nis_public: false';
                }
                
                updatedMarkdown = updatedMarkdown.replace(/^---\s*[\s\S]*?\s*---/, `---\n${fm.trim()}\n---`);
            } else {
                updatedMarkdown = `---\nis_public: false\n---\n${markdown}`;
            }

            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    markdown: updatedMarkdown,
                    id: bookUuid,
                    is_public: false
                })
            });

            if (response.ok) {
                markdown = updatedMarkdown;
                showUnpublishModal = false;
            } else {
                const errData = await response.json();
                alert(`Operation failed: ${errData.error}`);
            }
        } catch (err: any) {
            console.error('Unpublish error:', err);
            alert(`Error occurred: ${err.message || err}`);
        } finally {
            isPublishing = false;
        }
    }

    // Auto-save logic
    let saveTimeout: NodeJS.Timeout | null = null;
    let saveStatus = $state('Synced'); // 'Synced', 'Saving...', 'Error', 'Read Only'

    // Watch markdown changes and trigger debounced auto-save
    $effect(() => {
        if (markdown && data.session?.user) {
            triggerAutoSave();
        }
    });

    function triggerAutoSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveStatus = 'Saving...';
        saveTimeout = setTimeout(async () => {
            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ markdown, id: bookUuid })
                });
                
                if (response.ok) {
                    const resData = await response.json();
                    saveStatus = 'Synced';
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookUuid || '');
                    if (resData.id && (!bookUuid || !isUuid)) {
                        bookUuid = resData.id;
                        goto(`/workspace?id=${resData.id}`, { replaceState: true, noScroll: true, keepFocus: true });
                    }
                } else {
                    const errData = await response.json();
                    console.error('Failed to auto-save:', errData.error);
                    saveStatus = 'Error';
                }
            } catch (err) {
                console.error('Error auto-saving:', err);
                saveStatus = 'Error';
            }
        }, 1500); // 1.5 seconds debounce
    }

    // Scroll chat list to bottom
    let chatListContainer: HTMLDivElement | null = $state(null);
    function scrollToBottom() {
        setTimeout(() => {
            if (chatListContainer) {
                chatListContainer.scrollTop = chatListContainer.scrollHeight;
            }
        }, 50);
    }

    async function sendPrompt(promptText: string) {
        if (!promptText.trim() || isGenerating) return;

        const hasPending = attachedFiles.some(f => f.status === 'uploading' || f.status === 'loading');
        if (hasPending) {
            alert('ファイルの処理が完了するまでお待ちください。');
            return;
        }

        const successFiles = attachedFiles.filter(f => f.status === 'success');
        const images = successFiles.filter(f => f.type === 'image');
        const texts = successFiles.filter(f => f.type === 'text');

        let finalPrompt = promptText;
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

        // Add user message to history
        chatHistory = [...chatHistory, { role: 'user', text: finalPrompt }];
        currentInput = '';
        attachedFiles = [];
        isGenerating = true;
        errorMsg = '';
        scrollToBottom();

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    history: chatHistory.slice(0, -1), // Send previous history
                    currentMarkdown: markdown,
                    bookId: bookUuid,
                    mode: mode
                })
            });

            if (!response.ok) {
                const dataRes = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                throw new Error(dataRes.error || `HTTP error ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body has no reader.');
            }

            const decoder = new TextDecoder();
            let accumulatedText = '';
            
            // Append temporary empty AI response
            chatHistory = [...chatHistory, { role: 'model', text: '' }];
            const lastIndex = chatHistory.length - 1;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;

                // Update typing effect in chat
                chatHistory[lastIndex].text = accumulatedText;
                
                // Real-time markdown parsing
                const mdBlockMatch = accumulatedText.match(/```markdown([\s\S]*?)```/i);
                if (mdBlockMatch && mdBlockMatch[1].trim()) {
                    const parsedMarkdown = mdBlockMatch[1].trim();
                    markdown = parsedMarkdown;
                    const parsedIsCard = parsedMarkdown.includes('play_mode: card');
                    mode = parsedIsCard ? 'card' : 'book';
                }
                
                scrollToBottom();
            }

            // Final fallback parsing
            const finalMdMatch = accumulatedText.match(/```markdown([\s\S]*?)```/i);
            if (finalMdMatch) {
                markdown = finalMdMatch[1].trim();
            } else if (accumulatedText.includes('---')) {
                const startIndex = accumulatedText.indexOf('---');
                markdown = accumulatedText.substring(startIndex).trim();
            }
        } catch (err: any) {
            console.error('Generation failed:', err);
            errorMsg = err.message || '接続エラーが発生しました。GEMINI_API_KEYが正しく設定されているかご確認ください。';
        } finally {
            isGenerating = false;
            scrollToBottom();
        }
    }

    onMount(() => {
        document.body.classList.add('scroll-locked');

        const saved = localStorage.getItem('shelf-theme');
        if (saved) {
            uiTheme = saved;
        }

        if (!data.session?.user) {
            saveStatus = 'Read Only';
        }

        // Populate state from Page Loader Data
        markdown = data.markdown || '';
        bookUuid = data.bookId || '';
        chatHistory = data.initialChatHistory || [];

        const urlMode = page.url.searchParams.get('mode');
        if (urlMode === 'card') {
            mode = 'card';
        } else if (markdown) {
            const parsedIsCard = markdown.includes('play_mode: card');
            mode = parsedIsCard ? 'card' : 'book';
        }

        let initPrompt = page.url.searchParams.get('prompt');
        if (!initPrompt) {
            try {
                initPrompt = sessionStorage.getItem('workspace_init_prompt');
                if (initPrompt) {
                    sessionStorage.removeItem('workspace_init_prompt');
                }
            } catch (err) {
                console.error('Failed to read prompt from sessionStorage:', err);
            }
        }

        (async () => {
            if (initPrompt) {
                await sendPrompt(initPrompt);
            } else if (!data.bookId) {
                errorMsg = 'プロンプトが指定されていません。トップページからプロンプトを入力してください。';
            }
        })();

        return () => {
            document.body.classList.remove('scroll-locked');
        };
    });

    function handleChatSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (currentInput.trim()) {
            sendPrompt(currentInput);
        }
    }

    // Media panel functions
    async function searchMedia() {
        if (!mediaSearchQuery.trim()) {
            mediaSearchResults = [];
            totalMediaHits = 0;
            return;
        }
        isSearchingMedia = true;
        mediaSearchPage = 1;
        try {
            const response = await fetch(`/api/media/search?q=${encodeURIComponent(mediaSearchQuery)}&page=1`);
            if (response.ok) {
                const resData = await response.json();
                mediaSearchResults = resData.hits || [];
                totalMediaHits = resData.totalHits || 0;
            } else {
                console.error('Failed to search media');
            }
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            isSearchingMedia = false;
        }
    }

    async function loadMoreMedia() {
        if (isLoadingMoreMedia || isSearchingMedia || !mediaSearchQuery.trim()) return;
        isLoadingMoreMedia = true;
        const nextPage = mediaSearchPage + 1;
        try {
            const response = await fetch(`/api/media/search?q=${encodeURIComponent(mediaSearchQuery)}&page=${nextPage}`);
            if (response.ok) {
                const resData = await response.json();
                mediaSearchResults = [...mediaSearchResults, ...(resData.hits || [])];
                totalMediaHits = resData.totalHits || 0;
                mediaSearchPage = nextPage;
            } else {
                console.error('Failed to load more media');
            }
        } catch (err) {
            console.error('Load more error:', err);
        } finally {
            isLoadingMoreMedia = false;
        }
    }


    function openInsertMedia() {
        replaceTargetUrl = '';
        replaceTargetAlt = '';
        showMediaPanel = true;
        mediaSearchQuery = '';
        mediaSearchResults = [];
    }

    function selectMedia(url: string, altText: string) {
        if (replaceTargetUrl) {
            if (!confirm('Do you want to apply these changes?')) {
                return;
            }
            if (replaceTargetIsCover) {
                // Replace cover_image in frontmatter
                const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
                if (fmMatch) {
                    const fmLines = fmMatch[1].split('\n');
                    let coverImageFound = false;
                    const updatedLines = fmLines.map(line => {
                        const parts = line.split(':');
                        if (parts.length >= 2 && parts[0].trim() === 'cover_image') {
                            coverImageFound = true;
                            return `cover_image: ${url}`;
                        }
                        return line;
                    });
                    if (!coverImageFound) {
                        updatedLines.push(`cover_image: ${url}`);
                    }
                    markdown = `---\n${updatedLines.join('\n')}\n---` + markdown.replace(/^---\s*[\s\S]*?\s*---/, '');
                } else {
                    markdown = `---\ncover_image: ${url}\n---\n` + markdown;
                }
            } else {
                replaceImageUrl(url);
            }
        } else {
            insertImageAtCursor(url, altText || '画像');
        }
        showMediaPanel = false;
    }

    function handleWebViewClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target && target.tagName === 'IMG') {
            const src = target.getAttribute('src') || '';
            const alt = target.getAttribute('alt') || '';
            const isCover = target.classList.contains('clicked-img-cover') || target.classList.contains('cover-image') || target.id === 'coverImg';
            
            replaceTargetUrl = src;
            replaceTargetAlt = alt;
            replaceTargetIsCover = isCover;
            showMediaPanel = true;
            
            const cleanQuery = alt ? alt.replace(/[-_]/g, ' ').trim() : '';
            mediaSearchQuery = cleanQuery;
            if (cleanQuery) {
                searchMedia();
            } else {
                mediaSearchResults = [];
            }
        }
    }

    function replaceImageUrl(newUrl: string) {
        if (!replaceTargetUrl) return;

        const escapedAlt = replaceTargetAlt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`!\\[${escapedAlt || '.*?'}\\]\\((.*?)\\)`, 'g');
        let found = false;
        
        const newMarkdown = markdown.replace(regex, (match, url) => {
            const normUrl = url.trim().replace(/^\//, '').replace(/^books\//, '');
            const normTarget = replaceTargetUrl.trim().replace(/^\//, '').replace(/^books\//, '');
            
            if (normUrl === normTarget || url.includes(normTarget) || replaceTargetUrl.includes(url)) {
                found = true;
                return `![${replaceTargetAlt || 'image'}](${newUrl})`;
            }
            return match;
        });

        if (found) {
            markdown = newMarkdown;
        } else {
            const regexAltOnly = new RegExp(`!\\[${escapedAlt}\\]\\((.*?)\\)`, 'g');
            let foundAlt = false;
            const newMarkdownAlt = markdown.replace(regexAltOnly, (match) => {
                foundAlt = true;
                return `![${replaceTargetAlt}](${newUrl})`;
            });
            if (foundAlt) {
                markdown = newMarkdownAlt;
            } else {
                console.warn('Could not replace image URL in markdown');
            }
        }
    }

    function insertImageAtCursor(newUrl: string, altText: string) {
        const alt = altText.replace(/[\(\)\[\]]/g, '').trim();
        if (!sourceEditorEl) {
            markdown += `\n![${alt}](${newUrl})\n`;
            return;
        }

        const start = sourceEditorEl.selectionStart;
        const end = sourceEditorEl.selectionEnd;
        const text = sourceEditorEl.value;
        const before = text.substring(0, start);
        const after = text.substring(end);
        
        markdown = before + `![${alt}](${newUrl})` + after;
        
        tick().then(() => {
            if (sourceEditorEl) {
                sourceEditorEl.focus();
                const newCursorPos = start + `![${alt}](${newUrl})`.length;
                sourceEditorEl.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    }

    async function handleFileUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;
        
        const file = files[0];
        isUploadingMedia = true;

        try {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

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

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Failed to create canvas context');
            ctx.drawImage(img, 0, 0, width, height);

            const blob: Blob = await new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b!), 'image/webp', 0.85);
            });

            URL.revokeObjectURL(img.src);

            const sessionUser = data.session?.user;
            const userId = sessionUser?.id || 'guest';
            
            const cleanName = file.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const fileName = `${crypto.randomUUID()}_${cleanName}.webp`;
            const filePath = `${userId}/${fileName}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('HyperCardBookBucket')
                .upload(filePath, blob, {
                    contentType: 'image/webp',
                    cacheControl: '3600'
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicUrlData } = supabase.storage
                .from('HyperCardBookBucket')
                .getPublicUrl(filePath);

            const publicUrl = publicUrlData.publicUrl;
            
            selectMedia(publicUrl, file.name.split('.')[0] || 'uploaded-image');
        } catch (err: any) {
            console.error('Upload failed:', err);
            alert(`Failed to upload image: ${err.message || err}`);
        } finally {
            isUploadingMedia = false;
        }
    }

    // Uploaded images state
    let uploadedImages = $state<{ name: string; url: string }[]>([]);
    let isFetchingUploads = $state(false);

    async function fetchUploadedImages() {
        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        isFetchingUploads = true;
        try {
            const { data: files, error } = await supabase.storage
                .from('HyperCardBookBucket')
                .list(userId, {
                    limit: 100,
                    sortBy: { column: 'created_at', order: 'desc' }
                });

            if (error) {
                console.error('Failed to list storage files:', error);
                uploadedImages = [];
                return;
            }

            if (files) {
                uploadedImages = files.map(file => {
                    const { data: urlData } = supabase.storage
                        .from('HyperCardBookBucket')
                        .getPublicUrl(`${userId}/${file.name}`);
                    return {
                        name: file.name,
                        url: urlData.publicUrl
                    };
                });
            }
        } catch (err) {
            console.error('Error fetching uploaded images:', err);
        } finally {
            isFetchingUploads = false;
        }
    }

    // Trigger fetch on media panel open
    $effect(() => {
        if (showMediaPanel) {
            fetchUploadedImages();
        }
    });

    async function handleDeleteUploadedImage(e: MouseEvent, name: string) {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this image?')) return;

        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        const filePath = `${userId}/${name}`;

        try {
            const { error } = await supabase.storage
                .from('HyperCardBookBucket')
                .remove([filePath]);

            if (error) {
                throw error;
            }

            await fetchUploadedImages();
        } catch (err: any) {
            console.error('Failed to delete uploaded image:', err);
            alert(`Failed to delete image: ${err.message || err}`);
        }
    }

    async function handleDownloadUploadedImage(e: MouseEvent, url: string, name: string) {
        e.stopPropagation();
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Failed to download image:', err);
            alert('Failed to download image.');
        }
    }


</script>

<svelte:head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
</svelte:head>

<div class="workspace-layout" data-theme={uiTheme}>
    <!-- Left Panel: Chat -->
        <div class="chat-panel">
            <div class="panel-header">
                <div class="header-left">
                    <button class="back-home-btn" onclick={() => goto('/')}>back</button>
                    <h2>Chat</h2>
                </div>
                <div class="status-indicator" class:saving={saveStatus === 'Saving...'} class:error={saveStatus === 'Error'} class:read-only={saveStatus === 'Read Only'}>
                    {saveStatus}
                </div>
            </div>

            <div class="chat-list" bind:this={chatListContainer}>
                {#each chatHistory as message}
                    <div class="message-bubble" class:user={message.role === 'user'} class:ai={message.role === 'model'}>
                        <div class="bubble-avatar-container">
                            <div class="bubble-avatar">
                                {#if message.role === 'user'}
                                    {#if data.session?.user?.user_metadata?.avatar_url}
                                        <img src={data.session.user.user_metadata.avatar_url} alt="User" class="bubble-avatar-img" />
                                    {:else}
                                        👤
                                    {/if}
                                {:else}
                                    🤖
                                {/if}
                            </div>
                            {#if message.role === 'user'}
                                <span class="message-nickname" title={data.session?.user?.user_metadata?.nickname || data.session?.user?.user_metadata?.full_name || 'User'}>
                                    {data.session?.user?.user_metadata?.nickname || data.session?.user?.user_metadata?.full_name || 'User'}
                                </span>
                            {/if}
                        </div>
                        <div class="bubble-content">
                            {#if message.role === 'user'}
                                {@const parsed = parseUserMessage(message.text)}
                                {@html (marked.parse(parsed.body))}
                                
                                {#if parsed.images.length > 0}
                                    <div class="bubble-attached-images-grid">
                                        {#each parsed.images as img}
                                            <a href={img.url} target="_blank" class="bubble-attached-img-wrapper" title={img.name}>
                                                <img src={img.url} alt={img.name} class="bubble-attached-img" />
                                            </a>
                                        {/each}
                                    </div>
                                {/if}
                                
                                {#if parsed.texts.length > 0}
                                    <div class="bubble-attached-texts-list">
                                        {#each parsed.texts as txt}
                                            <details class="bubble-attached-text-details">
                                                <summary>📄 {txt.name}</summary>
                                                <pre class="bubble-attached-text-content">{txt.content}</pre>
                                            </details>
                                        {/each}
                                    </div>
                                {/if}
                            {:else}
                                {@html (marked.parse(message.text.replace(/```(?:markdown)?[\s\S]*?```/gi, mode === 'card' ? '[カードを生成・更新しました]' : '[本を生成・更新しました]').trim()))}
                            {/if}
                        </div>
                    </div>
                {/each}

                {#if isGenerating}
                    <div class="message-bubble ai loading">
                        <div class="bubble-avatar animate-pulse">🤖</div>
                        <div class="bubble-content">
                            <div class="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                {/if}

                {#if errorMsg}
                    <div class="error-banner">
                        ⚠️ {errorMsg}
                    </div>
                {/if}
            </div>

            <!-- Hidden file input for attachments -->
            <input
                type="file"
                accept="image/*,text/plain,text/markdown,.md,.txt"
                multiple
                bind:this={fileInputEl}
                onchange={handleAttachedFilesChange}
                class="hidden-file-input"
            />

            <div class="chat-form-container">
                <!-- Attached files preview container -->
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

                <form onsubmit={handleChatSubmit} class="chat-form">
                    <div class="unified-chat-input-box">
                        <textarea
                            bind:value={currentInput}
                            placeholder="Please enter a prompt to correct the book."
                            disabled={!data.session?.user || isGenerating}
                            onkeydown={handleKeyDown}
                            rows="2"
                        ></textarea>
                        <div class="chat-actions-row">
                            <button
                                type="button"
                                class="inner-attach-btn"
                                onclick={() => fileInputEl?.click()}
                                disabled={!data.session?.user || isGenerating}
                                title="Attach files"
                            >
                                ＋
                            </button>
                            <button 
                                type="submit" 
                                class="inner-run-btn"
                                disabled={!data.session?.user || isGenerating || (!currentInput.trim() && attachedFiles.length === 0)}
                            >
                                Run ⌘↵
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

    <!-- Right Panel: Editor / Preview -->
    <div class="preview-panel">
        <div class="panel-tabs">
            <div class="tabs-left">
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'preview'} 
                    onclick={() => activeTab = 'preview'}
                >
                    Preview
                </button>
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'source'} 
                    onclick={() => activeTab = 'source'}
                >
                    Code (Markdown)
                </button>
            </div>
            <div class="tabs-right" style="display: flex; gap: 10px; align-items: center; padding-right: 12px;">
                {#if activeTab === 'source'}
                    <button 
                        class="toggle-monaco-btn" 
                        onclick={toggleMonaco} 
                        disabled={!data.session?.user}
                        style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #ffffff; padding: 5px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; height: 32px; font-family: system-ui, sans-serif;"
                        title={useMonaco ? "通常のテキストボックスに戻る" : "Monacoエディタに切り替える"}
                    >
                        {useMonaco ? '🔠' : '🆎'}
                    </button>
                    <button class="insert-media-btn" onclick={openInsertMedia} disabled={!data.session?.user}>
                        🖼️ Insert Image
                    </button>
                {/if}
                {#if (mode === 'card' && cardSlug) || (mode === 'book' && bookUuid)}
                    <button 
                        class="card-action-btn tabs-action-btn" 
                        onclick={handlePublishBtnClick} 
                        title="Publish"
                    >
                        {isPublic ? '👤' : '👥'}
                    </button>
                    <button 
                        class="card-action-btn tabs-action-btn" 
                        onclick={handleDownloadHtml} 
                        title="HTMLダウンロード (💾)"
                    >
                        💾
                    </button>
                    <button 
                        class="card-action-btn tabs-action-btn" 
                        onclick={handleExportHtmlLink} 
                        disabled={isExportingHtml}
                        title="HTMLとして公開 (🌐)"
                    >
                        🌐
                    </button>
                    <a 
                        class="card-action-btn tabs-action-btn" 
                        href={mode === 'card' ? `/hypercard/${cardSlug}?embed=true` : `/hyperbook/${bookUuid}`} 
                        target="_blank" 
                        title="New tab"
                        style="text-decoration: none;"
                    >
                        🔗
                    </a>
                {/if}
            </div>
        </div>

        <div class="panel-body">
            <div class="preview-container" class:hidden={activeTab !== 'preview'}>
                {#if mode === 'card'}
                    <div onclick={handleWebViewClick} role="presentation" class="preview-scroll-wrapper" style="width: 100%; height: 100%; overflow-y: auto;">
                        <Card markdown={markdown} id={bookUuid || cardSlug} isEmbed={true} showNewTab={false} />
                    </div>
                {:else}
                    {#if markdown}
                        <div onclick={handleWebViewClick} role="presentation" class="preview-scroll-wrapper" style="width: 100%; height: 100%; overflow-y: auto;">
                            <Book {markdown} id={bookUuid} />
                        </div>
                    {:else}
                        <div class="empty-preview">
                            <div class="spinner"></div>
                            <p>本を生成しています。しばらくお待ちください...</p>
                        </div>
                    {/if}
                {/if}
            </div>
            
            <textarea
                bind:this={sourceEditorEl}
                bind:value={markdown}
                placeholder="YAML frontmatter and Markdown format..."
                class="source-editor"
                class:hidden={activeTab !== 'source' || useMonaco}
                readonly={!data.session?.user}
            ></textarea>

            {#if useMonaco}
                <div 
                    bind:this={monacoContainerEl} 
                    class="monaco-container" 
                    class:hidden={activeTab !== 'source'}
                    style="width: 100%; height: 100%; text-align: left;"
                ></div>
            {/if}
        </div>
    </div>

    {#if showMediaPanel}
        <div class="modal-overlay" onclick={() => showMediaPanel = false} onkeydown={(e) => e.key === 'Escape' && (showMediaPanel = false)} role="presentation">
            <div class="media-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="modal-header">
                    <h2>{replaceTargetUrl ? 'Replace Image' : 'Insert Image'}</h2>
                    <button class="close-btn" onclick={() => showMediaPanel = false}>✕</button>
                </div>
                
                <div class="media-panel-body">
                    <!-- Upload section -->
                    <div class="media-upload-section">
                        {#if uploadedImages.length > 0}
                            <div class="uploaded-thumbnails-container">
                                <div class="uploaded-thumbnails-grid">
                                    {#each uploadedImages as img}
                                        <div 
                                            class="thumbnail-wrapper" 
                                            onclick={() => selectMedia(img.url, img.name.split('_').slice(1).join('_').split('.')[0] || 'image')}
                                            onkeydown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    selectMedia(img.url, img.name.split('_').slice(1).join('_').split('.')[0] || 'image');
                                                }
                                            }}
                                            role="button"
                                            tabindex="0"
                                        >
                                            <img src={img.url} alt={img.name} class="thumbnail-img" />
                                            <div class="thumbnail-actions">
                                                <button 
                                                    class="thumbnail-action-btn delete-btn" 
                                                    onclick={(e) => handleDeleteUploadedImage(e, img.name)}
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                                <button 
                                                    class="thumbnail-action-btn download-btn" 
                                                    onclick={(e) => handleDownloadUploadedImage(e, img.url, img.name)}
                                                    title="Download"
                                                >
                                                    💾
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                        <h4>UPLOAD IMAGE</h4>
                        <label class="media-upload-dropzone">
                            <input 
                                type="file" 
                                accept="image/*" 
                                bind:this={uploadFileInput}
                                onchange={handleFileUpload} 
                                disabled={isUploadingMedia}
                                class="hidden-file-input"
                            />
                            {#if isUploadingMedia}
                                <div class="upload-loader">
                                    <div class="spinner-small"></div>
                                    <span>Uploading...</span>
                                </div>
                            {:else}
                                <div class="upload-prompt">
                                    📤 <span>Choose file to upload</span>
                                    <span class="upload-limit">Max 5MB (auto-compressed)</span>
                                </div>
                            {/if}
                        </label>
                    </div>

                    <!-- Search section -->
                    <div class="media-search-section">
                        <h4>Search Pixabay Images</h4>
                        <form onsubmit={(e) => { e.preventDefault(); searchMedia(); }} class="media-search-form">
                            <input 
                                type="text" 
                                bind:value={mediaSearchQuery} 
                                placeholder="Search terms (e.g. cat, space)" 
                                disabled={isSearchingMedia}
                            />
                            <button type="submit" disabled={isSearchingMedia || !mediaSearchQuery.trim()}>
                                Search
                            </button>
                        </form>
                        
                        <div class="media-results-container">
                            {#if isSearchingMedia}
                                <div class="media-loader">
                                    <div class="spinner-small"></div>
                                    <p>Searching...</p>
                                </div>
                            {:else if mediaSearchResults.length > 0}
                                <div class="media-grid">
                                    {#each mediaSearchResults as hit}
                                        <button 
                                            class="media-grid-item" 
                                            onclick={() => selectMedia(hit.webformatUrl, hit.tags)}
                                            title={hit.tags}
                                        >
                                            <img src={hit.previewUrl} alt={hit.tags} loading="lazy" />
                                        </button>
                                    {/each}
                                </div>
                                {#if mediaSearchResults.length < totalMediaHits}
                                    <div class="media-more-container">
                                        <button 
                                            class="media-more-btn" 
                                            onclick={loadMoreMedia} 
                                            disabled={isLoadingMoreMedia}
                                        >
                                            {#if isLoadingMoreMedia}
                                                Loading...
                                            {:else}
                                                more...
                                            {/if}
                                        </button>
                                    </div>
                                {/if}
                            {:else if mediaSearchQuery}
                                <p class="media-no-results">No results found for "{mediaSearchQuery}"</p>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Publish confirmation modal -->
    {#if showPublishModal}
        <div class="modal-overlay" onclick={() => showPublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Published content is visible to everyone.</p>
                    <p>It may be searchable on Google.</p>
                    <p>Other users can reuse and build upon your work.</p>
                    
                    <label class="publish-confirm-label">
                        <input type="checkbox" bind:checked={confirmLegal} />
                        <span>I confirm that my data is legal and follows the rules.</span>
                    </label>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showPublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executePublish} disabled={!confirmLegal || isPublishing}>
                        {isPublishing ? 'Publishing...' : 'Publish'}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Unpublish confirmation modal -->
    {#if showUnpublishModal}
        <div class="modal-overlay" onclick={() => showUnpublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Make this private?</p>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showUnpublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executeUnpublish} disabled={isPublishing}>
                        {isPublishing ? 'Updating...' : 'Make Private'}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .workspace-layout {
        display: flex;
        width: 100vw;
        height: 100vh;
        background-color: #0b0c10;
        overflow: hidden;
    }

    /* Left Panel: Chat */
    .chat-panel {
        display: flex;
        flex-direction: column;
        width: 400px;
        min-width: 320px;
        height: 100%;
        background-color: #12131c;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .back-home-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
        font-family: system-ui, sans-serif;
    }

    .back-home-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: scale(1.02);
    }

    .panel-header h2 {
        font-family: 'Outfit', sans-serif;
        font-size: 18px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
    }

    .status-indicator {
        font-size: 11px;
        color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        padding: 2px 8px;
        border-radius: 12px;
        font-family: monospace;
    }

    .status-indicator.saving {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
    }

    .status-indicator.error {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
    }

    .status-indicator.read-only {
        color: #9ca3af;
        background: rgba(156, 163, 175, 0.15);
    }

    .chat-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
    }

    .message-bubble {
        display: flex;
        gap: 12px;
        animation: fadeIn 0.3s ease-out forwards;
    }

    .bubble-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        font-size: 16px;
        flex-shrink: 0;
    }

    .bubble-content {
        background: rgba(255, 255, 255, 0.04);
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        max-width: 80%;
        word-wrap: break-word;
        white-space: normal;
    }

    .bubble-content :global(p) {
        margin: 0 0 8px 0;
    }
    
    .bubble-content :global(p:last-child) {
        margin-bottom: 0;
    }

    .bubble-content :global(ul), .bubble-content :global(ol) {
        margin: 8px 0;
        padding-left: 20px;
    }

    .bubble-content :global(li) {
        margin-bottom: 4px;
    }

    .bubble-content :global(pre) {
        background: rgba(0, 0, 0, 0.25);
        padding: 10px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 8px 0;
    }

    .bubble-content :global(code) {
        font-family: 'Courier New', Courier, monospace;
        font-size: 13px;
        background: rgba(0, 0, 0, 0.15);
        padding: 2px 4px;
        border-radius: 4px;
        word-break: break-all;
    }

    .bubble-content :global(pre code) {
        background: none;
        padding: 0;
        border-radius: 0;
        word-break: normal;
    }

    .message-bubble.user {
        flex-direction: row-reverse;
    }

    .message-bubble.user .bubble-content {
        background: #8b5cf6;
        color: #ffffff;
    }



    .error-banner {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
    }

    /* Typing indicator */
    .typing-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        height: 20px;
    }

    .typing-indicator span {
        width: 6px;
        height: 6px;
        background: #9ca3af;
        border-radius: 50%;
        animation: typing 1.4s infinite both;
    }

    .typing-indicator span:nth-child(2) { animation-delay: .2s; }
    .typing-indicator span:nth-child(3) { animation-delay: .4s; }

    @keyframes typing {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }

    /* Right Panel: Preview and Editor */
    .preview-panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;
        background-color: #0b0c10;
        box-sizing: border-box;
    }

    .panel-tabs {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #12131c;
    }

    .tabs-left {
        display: flex;
        gap: 8px;
    }

    .insert-media-btn {
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.3);
        color: #c084fc;
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 8px;
    }

    .insert-media-btn:hover {
        background: rgba(139, 92, 246, 0.25);
        border-color: rgba(139, 92, 246, 0.5);
        color: #ffffff;
    }

    .insert-media-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
        color: #9ca3af;
    }

    /* Media Panel (Drawer) */
    .media-panel {
        display: flex;
        flex-direction: column;
        width: 400px;
        min-width: 320px;
        height: 100%;
        background-color: #12131c;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
    }

    .media-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .media-panel-header h3 {
        font-family: 'Outfit', sans-serif;
        font-size: 16px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
    }

    .close-media-btn {
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
    }

    .close-media-btn:hover {
        color: #ffffff;
    }

    .media-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-sizing: border-box;
    }

    .media-panel-body h4 {
        margin: 0 0 10px 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #9ca3af;
        font-family: 'Outfit', sans-serif;
    }

    /* Upload section styling */
    .media-upload-dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px dashed rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 20px;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.15);
        transition: all 0.2s;
    }

    .media-upload-dropzone:hover {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.05);
    }

    .hidden-file-input {
        display: none;
    }

    .upload-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        color: #cbd5e1;
        font-size: 13px;
    }

    .upload-limit {
        font-size: 11px;
        color: #9ca3af;
    }

    .upload-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: #c084fc;
        font-size: 13px;
    }

    /* Search section styling */
    .media-search-form {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
    }

    .media-search-form input {
        flex: 1;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 8px 12px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
    }

    .media-search-form input:focus {
        border-color: #8b5cf6;
    }

    .media-search-form button {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        color: #ffffff;
        border-radius: 6px;
        padding: 0 14px;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .media-results-container {
        flex: 1;
        min-height: 200px;
    }

    .media-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }

    .media-grid-item {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 0;
        overflow: hidden;
        cursor: pointer;
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .media-grid-item:hover {
        transform: scale(1.05);
        border-color: #8b5cf6;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    .media-grid-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .media-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 0;
        gap: 12px;
        color: #9ca3af;
        font-size: 13px;
    }

    .spinner-small {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .media-no-results {
        text-align: center;
        color: #9ca3af;
        font-size: 13px;
        padding: 20px 0;
    }

    .tab-btn {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #9ca3af;
        padding: 8px 16px 12px;
        font-family: 'Outfit', sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .tab-btn:hover {
        color: #ffffff;
    }

    .tab-btn.active {
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
    }

    .panel-body {
        flex: 1;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
    }

    .preview-container {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }

    .preview-scroll-wrapper::-webkit-scrollbar {
        width: 6px;
    }
    .preview-scroll-wrapper::-webkit-scrollbar-track {
        background: transparent;
    }
    .preview-scroll-wrapper::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
    }
    .preview-scroll-wrapper::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .source-editor {
        width: 100%;
        height: 100%;
        background: #ffffff;
        border: none;
        box-sizing: border-box;
        padding: 24px;
        color: #1a1a1a;
        font-family: monospace;
        font-size: 14px;
        line-height: 1.6;
        resize: none;
        outline: none;
    }

    .toggle-monaco-btn:hover {
        background: rgba(255, 255, 255, 0.12) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
    }

    .empty-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        gap: 16px;
        color: #9ca3af;
    }

    .empty-preview .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
    }

    .hidden {
        display: none !important;
    }

    /* Uploaded image thumbnails */
    .uploaded-thumbnails-container {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.15);
    }

    .uploaded-thumbnails-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }

    .thumbnail-wrapper {
        position: relative;
        aspect-ratio: 1;
        cursor: pointer;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: transform 0.2s, border-color 0.2s;
    }

    .thumbnail-wrapper:hover {
        transform: scale(1.05);
        border-color: #8b5cf6;
    }

    .thumbnail-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .thumbnail-actions {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 10;
    }

    .thumbnail-wrapper:hover .thumbnail-actions {
        opacity: 1;
    }

    .thumbnail-action-btn {
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 4px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 11px;
        padding: 0;
        transition: background 0.2s;
    }

    .thumbnail-action-btn:hover {
        background: rgba(0, 0, 0, 0.9);
    }

    .thumbnail-action-btn.delete-btn:hover {
        background: #ef4444;
        border-color: #ef4444;
    }

    .media-more-container {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
        width: 100%;
    }

    .media-more-btn {
        background: none;
        border: none;
        color: #8b5cf6;
        cursor: pointer;
        font-size: 13px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        padding: 4px 8px;
        transition: color 0.2s;
    }

    .media-more-btn:hover:not(:disabled) {
        color: #c084fc;
    }

    .media-more-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .tabs-action-btn {
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 4px;
        line-height: 1;
        height: 24px;
        box-sizing: border-box;
    }

    .card-action-btn {
        padding: 8px 12px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(22, 22, 22, 0.8);
        color: #ffffff;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.3s;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    
    .card-action-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.05);
    }

    .card-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    .bubble-avatar-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .bubble-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
    }

    .message-nickname {
        font-size: 10px;
        opacity: 0.65;
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: system-ui, sans-serif;
        color: #e2e8f0;
    }
    
    .workspace-layout[data-theme="light"] .message-nickname {
        color: #3d2516;
    }

    /* Left Panel Light Theme override */
    .workspace-layout[data-theme="light"] .chat-panel {
        background-color: #ebdcd0;
        border-right: 1px solid rgba(61, 37, 22, 0.1);
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .panel-header {
        border-bottom: 1px solid rgba(61, 37, 22, 0.1);
    }

    .workspace-layout[data-theme="light"] .panel-header h2,
    .workspace-layout[data-theme="light"] .panel-header h3 {
        color: #000000;
    }

    .workspace-layout[data-theme="light"] .back-home-btn {
        background: rgba(61, 37, 22, 0.05);
        border: 1px solid rgba(61, 37, 22, 0.1);
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .back-home-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }

    .workspace-layout[data-theme="light"] .save-status {
        color: rgba(61, 37, 22, 0.6);
    }

    /* AIバブルの文字をライトモード時にハッキリ黒く見せるための追加修正 */
    .workspace-layout[data-theme="light"] .message-bubble:not(.user) .bubble-content {
        background: #ffffff;
        color: #3d2516;
    }

    /* Right Panel upper Tabs - Light Theme */
    .workspace-layout[data-theme="light"] .panel-tabs {
        background-color: #ebdcd0;
        border-bottom: 1px solid rgba(61, 37, 22, 0.1);
    }

    .workspace-layout[data-theme="light"] .tab-btn {
        color: rgba(61, 37, 22, 0.6);
    }

    .workspace-layout[data-theme="light"] .tab-btn:hover {
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .tab-btn.active {
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
    }

    .workspace-layout[data-theme="light"] .insert-media-btn {
        background: rgba(139, 92, 246, 0.1);
        border: 1px solid rgba(139, 92, 246, 0.25);
        color: #6d28d9;
    }

    .workspace-layout[data-theme="light"] .insert-media-btn:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.2);
        color: #5b21b6;
    }

    .workspace-layout[data-theme="light"] .card-action-btn {
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 2px 8px rgba(61, 37, 22, 0.08);
    }

    .workspace-layout[data-theme="light"] .card-action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 1);
        border-color: rgba(61, 37, 22, 0.3);
    }

    /* Media Modal - Light Theme */
    .workspace-layout[data-theme="light"] .media-modal-card {
        background-color: #ebdcd0;
        border: 1px solid rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }

    .workspace-layout[data-theme="light"] .modal-header {
        border-bottom: 1px solid rgba(61, 37, 22, 0.1);
    }

    .workspace-layout[data-theme="light"] .modal-header h2 {
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .close-btn {
        color: rgba(61, 37, 22, 0.6);
    }

    .workspace-layout[data-theme="light"] .close-btn:hover {
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .media-panel-body h4 {
        color: rgba(61, 37, 22, 0.6);
    }

    .workspace-layout[data-theme="light"] .media-upload-dropzone {
        border: 2px dashed rgba(61, 37, 22, 0.15);
        background: rgba(255, 255, 255, 0.4);
    }

    .workspace-layout[data-theme="light"] .media-upload-dropzone:hover {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.05);
    }

    .workspace-layout[data-theme="light"] .upload-prompt {
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .upload-limit {
        color: rgba(61, 37, 22, 0.6);
    }

    .workspace-layout[data-theme="light"] .media-search-form input {
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(61, 37, 22, 0.15);
        color: #3d2516;
    }

    .workspace-layout[data-theme="light"] .media-search-form input:focus {
        border-color: #8b5cf6;
    }

    .workspace-layout[data-theme="light"] .media-grid-item {
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(61, 37, 22, 0.1);
    }

    .workspace-layout[data-theme="light"] .media-grid-item:hover {
        border-color: #8b5cf6;
    }

    .workspace-layout[data-theme="light"] .uploaded-thumbnails-container {
        border: 1px solid rgba(61, 37, 22, 0.1);
        background: rgba(255, 255, 255, 0.4);
    }

    .workspace-layout[data-theme="light"] .thumbnail-wrapper {
        border: 1px solid rgba(61, 37, 22, 0.1);
    }

    .workspace-layout[data-theme="light"] .thumbnail-wrapper:hover {
        border-color: #8b5cf6;
    }

    /* Chat Form Wrapper and Actions Row */
    .chat-form-container {
        display: flex;
        flex-direction: column;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #12131c;
        padding: 12px 20px 16px;
    }

    .workspace-layout[data-theme="light"] .chat-form-container {
        background-color: #ebdcd0;
        border-top-color: rgba(61, 37, 22, 0.1);
    }

    .chat-form {
        display: flex;
        flex-direction: column;
        padding: 0;
        border-top: none;
        background-color: transparent;
    }

    .unified-chat-input-box {
        display: flex;
        flex-direction: column;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 12px 14px;
        gap: 8px;
        transition: border-color 0.2s;
    }

    .workspace-layout[data-theme="light"] .unified-chat-input-box {
        background: #ffffff;
        border-color: rgba(61, 37, 22, 0.15);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .unified-chat-input-box:focus-within {
        border-color: #8b5cf6;
    }

    .unified-chat-input-box textarea {
        width: 100%;
        border: none;
        background: transparent;
        color: #ffffff;
        font-size: 14px;
        line-height: 1.5;
        outline: none;
        resize: none;
        box-sizing: border-box;
        font-family: system-ui, sans-serif;
    }

    .workspace-layout[data-theme="light"] .unified-chat-input-box textarea {
        color: #3d2516;
    }

    .chat-actions-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: 4px;
    }

    .inner-attach-btn {
        background: transparent;
        border: none;
        color: #9ca3af;
        font-size: 20px;
        font-weight: 300;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s, transform 0.1s;
    }

    .workspace-layout[data-theme="light"] .inner-attach-btn {
        color: #888888;
    }

    .inner-attach-btn:hover:not(:disabled) {
        color: #ffffff;
        transform: scale(1.05);
    }

    .workspace-layout[data-theme="light"] .inner-attach-btn:hover:not(:disabled) {
        color: #3d2516;
    }

    .inner-run-btn {
        background: #8b5cf6;
        border: none;
        color: #ffffff;
        border-radius: 20px;
        padding: 6px 16px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
    }

    .inner-run-btn:hover:not(:disabled) {
        background: #7c3aed;
        transform: scale(1.03);
    }

    .inner-run-btn:disabled, .inner-attach-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
    }

    /* Attached files preview bar */
    .attached-files-preview-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
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
        border: 1px solid rgba(139, 92, 246, 0.3);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: #cbd5e1;
        max-width: 180px;
        box-sizing: border-box;
    }

    .workspace-layout[data-theme="light"] .attached-file-badge {
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

    /* Bubble Attached Items */
    .bubble-attached-images-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 6px;
        margin-top: 8px;
    }

    .bubble-attached-img-wrapper {
        aspect-ratio: 1;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.15);
        cursor: pointer;
        transition: transform 0.2s, border-color 0.2s;
        display: block;
    }

    .workspace-layout[data-theme="light"] .bubble-attached-img-wrapper {
        border-color: rgba(61, 37, 22, 0.15);
    }

    .bubble-attached-img-wrapper:hover {
        transform: scale(1.05);
        border-color: #8b5cf6;
    }

    .bubble-attached-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .bubble-attached-texts-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 4px;
    }

    .bubble-attached-text-details {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        overflow: hidden;
    }

    .workspace-layout[data-theme="light"] .bubble-attached-text-details {
        background: rgba(255, 255, 255, 0.4);
        border-color: rgba(61, 37, 22, 0.1);
    }

    .bubble-attached-text-details summary {
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        user-select: none;
        outline: none;
        color: #cbd5e1;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.02);
    }

    .workspace-layout[data-theme="light"] .bubble-attached-text-details summary {
        color: #3d2516;
        background: rgba(61, 37, 22, 0.02);
    }

    .bubble-attached-text-details summary:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .workspace-layout[data-theme="light"] .bubble-attached-text-details summary:hover {
        background: rgba(61, 37, 22, 0.05);
    }

    .bubble-attached-text-content {
        margin: 0;
        padding: 10px;
        font-size: 11px;
        font-family: monospace;
        line-height: 1.4;
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        max-height: 150px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
        color: #a7f3d0;
    }

    .workspace-layout[data-theme="light"] .bubble-attached-text-content {
        background: rgba(255, 255, 255, 0.8);
        border-top-color: rgba(61, 37, 22, 0.05);
        color: #065f46;
    }

    /* Modal Overlay and Card styles for Media Selection */
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
    
    .media-modal-card {
        background: #12131c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 90%;
        max-width: 500px;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        max-height: 80vh;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #cbd5e1;
        overflow: hidden;
        box-sizing: border-box;
        text-align: left;
    }
    
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .modal-header h2 {
        font-family: 'Outfit', sans-serif;
        font-size: 16px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
    }
    
    .close-btn {
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
    }
    
    .close-btn:hover {
        color: #ffffff;
    }

    /* Publish Modal Styles */
    .publish-modal-card {
        background: #12131c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 90%;
        max-width: 480px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #cbd5e1;
        overflow: hidden;
        box-sizing: border-box;
        text-align: left;
        padding: 24px;
        gap: 16px;
    }
    
    .workspace-layout[data-theme="light"] .publish-modal-card {
        background: #f4eae1;
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }
    
    .publish-modal-body {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .publish-modal-body p {
        margin: 0;
    }
    
    .publish-confirm-label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 14px;
        cursor: pointer;
        user-select: none;
    }

    .publish-confirm-label input {
        margin-top: 3px;
        cursor: pointer;
    }

    .publish-confirm-label span {
        font-size: 13px;
        font-weight: 500;
        opacity: 0.9;
    }
    
    .publish-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
    }
    
    .publish-modal-footer button {
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
    }
    
    .publish-modal-footer .btn-cancel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: inherit;
    }
    
    .publish-modal-footer .btn-cancel:hover {
        background: rgba(255, 255, 255, 0.12);
    }
    
    .workspace-layout[data-theme="light"] .publish-modal-footer .btn-cancel {
        background: rgba(0, 0, 0, 0.03);
        border-color: rgba(0, 0, 0, 0.1);
    }
    
    .publish-modal-footer .btn-publish {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    
    .publish-modal-footer .btn-publish:hover:not(:disabled) {
        filter: brightness(1.1);
    }
    
    .publish-modal-footer .btn-publish:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        box-shadow: none;
    }
</style>
