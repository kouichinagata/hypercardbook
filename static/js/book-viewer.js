/* book-viewer.js - Pure JS library for standalone HyperBook rendering and page turn controls */

(function () {
    class HyperBookViewer {
        constructor() {
            this.markdown = '';
            this.title = 'Untitled Book';
            this.author = '';
            this.coverImage = '';
            this.authorImage = '';
            this.authorBio = '';
            this.themeColor = 'black';
            this.spreads = [];
            
            // UI States
            this.currentIndex = -1;
            this.currentSubPage = 0;
            this.viewMode = 'spread'; // 'spread' or 'vertical'
            this.uiTheme = 'light';
            this.insertToc = false;
            this.isFullscreen = false;
            
            this.dom = {};
            this.tocItems = [];
            
            this.init();
        }

        async init() {
            // Load Markdown from DOM
            const scriptEl = document.getElementById('book-markdown');
            if (!scriptEl) {
                console.error('Book markdown element (#book-markdown) not found.');
                return;
            }
            this.markdown = scriptEl.textContent || '';
            
            this.parseMarkdown();
            this.detectViewMode();
            this.buildDOMStructure();
            this.initMermaid();
            this.bindEvents();
            this.updateUI();
            
            window.addEventListener('resize', () => {
                this.detectViewMode();
                this.updateUI();
            });
        }

        parseMarkdown() {
            const trimmed = this.markdown.trim();
            
            // Extract frontmatter
            const fmMatch = trimmed.match(/^---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                lines.forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const k = parts[0].trim();
                        const v = parts.slice(1).join(':').trim();
                        if (k === 'title') this.title = v;
                        if (k === 'author') this.author = v;
                        if (k === 'cover_image') this.coverImage = this.normalizePath(v);
                        if (k === 'author_image') this.authorImage = this.normalizePath(v);
                        if (k === 'theme_color') this.themeColor = v;
                    }
                });
                
                const bioMatch = fmMatch[1].match(/author_bio:\s*\|\s*\n([\s\S]*)/);
                if (bioMatch) {
                    this.authorBio = bioMatch[1].trim();
                }
            }

            // Split pages by "Page X:" or "***"
            let contentWithoutFm = trimmed.replace(/^---\s*([\s\S]*?)\s*---/, '').trim();

            // Extract user style blocks
            const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
            let styleMatch;
            let userStyles = '';
            while ((styleMatch = styleRegex.exec(contentWithoutFm)) !== null) {
                userStyles += styleMatch[1] + '\n';
            }
            contentWithoutFm = contentWithoutFm.replace(/<style>[\s\S]*?<\/style>/gi, '');

            if (userStyles) {
                const styleEl = document.createElement('style');
                styleEl.id = 'user-styles';
                styleEl.textContent = userStyles;
                document.head.appendChild(styleEl);
            }

            let pagesRaw = contentWithoutFm.split(/(?:Page\s*\d+:|(?:^|\n)\s*\*\*\*\s*(?:\n|$))/i);
            pagesRaw = pagesRaw.map(p => p.trim()).filter(p => p.length > 0);
            if (pagesRaw.length === 0 && contentWithoutFm.length > 0) {
                pagesRaw = [contentWithoutFm];
            }

            for (let i = 0; i < pagesRaw.length; i += 2) {
                const leftPart = pagesRaw[i] || "";
                const rightPart = pagesRaw[i+1] || "";
                
                let cleanLeft = leftPart.trim();
                if (cleanLeft.endsWith('---')) {
                    cleanLeft = cleanLeft.substring(0, cleanLeft.length - 3).trim();
                }
                let cleanRight = rightPart.trim();
                if (cleanRight.endsWith('---')) {
                    cleanRight = cleanRight.substring(0, cleanRight.length - 3).trim();
                }

                // Title extraction for TOC
                const titleMatch = cleanRight.match(/##\s*(.*)/);
                const pageTitle = titleMatch ? titleMatch[1].replace(/[\*_`]/g, '').trim() : `Spread ${this.spreads.length + 1}`;

                this.spreads.push({
                    title: pageTitle,
                    leftMarkdown: cleanLeft,
                    rightMarkdown: cleanRight
                });
            }

            // Pre-calculate TOC items
            this.buildTocItems();
        }

        buildTocItems() {
            this.tocItems = [];
            const hasToc = this.insertToc;
            
            this.spreads.forEach((spread, i) => {
                const leftHeading = this.extractLargestHeading(spread.leftMarkdown);
                if (leftHeading) {
                    this.tocItems.push({
                        title: leftHeading,
                        pageStr: (i * 2 + 1).toString(),
                        jumpIndex: hasToc ? i + 1 : i
                    });
                }
                
                const rightHeading = this.extractLargestHeading(spread.rightMarkdown);
                if (rightHeading) {
                    this.tocItems.push({
                        title: rightHeading,
                        pageStr: (i * 2 + 2).toString(),
                        jumpIndex: hasToc ? i + 1 : i
                    });
                }
            });

            if (this.authorBio) {
                this.tocItems.push({
                    title: "Author",
                    pageStr: (this.spreads.length * 2 + 1).toString(),
                    jumpIndex: this.getTotalPages()
                });
            }
        }

        extractLargestHeading(md) {
            if (!md) return null;
            const lines = md.split('\n');
            let h1 = null, h2 = null, h3 = null;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^#\s+(.+)/.test(trimmed)) {
                    if (!h1) h1 = trimmed.match(/^#\s+(.+)/)[1].trim();
                } else if (/^##\s+(.+)/.test(trimmed)) {
                    if (!h2) h2 = trimmed.match(/^##\s+(.+)/)[1].trim();
                } else if (/^###\s+(.+)/.test(trimmed)) {
                    if (!h3) h3 = trimmed.match(/^###\s+(.+)/)[1].trim();
                }
            }
            const rawTitle = h1 || h2 || h3;
            return rawTitle ? rawTitle.replace(/[\*_`]/g, '').trim() : null;
        }

        getTotalPages() {
            let t = this.spreads.length - 1;
            if (this.insertToc) t += 1;
            if (this.authorBio) t += 1;
            return t;
        }

        normalizePath(url) {
            if (!url) return '';
            const trimmed = url.trim();
            if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
                return '/' + trimmed;
            }
            return trimmed;
        }

        detectViewMode() {
            const isNarrow = window.innerWidth <= 768;
            this.viewMode = isNarrow ? 'vertical' : 'spread';
            if (isNarrow) {
                this.currentSubPage = 0;
            }
        }

        buildDOMStructure() {
            // Apply theme attributes to body
            const isPreset = ['white', 'black', 'blue', 'pink', 'gold'].includes(this.themeColor);
            document.body.setAttribute('data-theme', this.uiTheme);
            document.body.setAttribute('data-book-theme', isPreset ? this.themeColor : 'black');
            
            const texts = {
                toggleView: 'Switch View',
                clickCover: 'Click to read',
                btnFirst: 'First Page',
                btnPrev: 'Previous Page',
                btnNext: 'Next Page',
                btnLast: 'Last Page',
                btnFullscreen: 'Fullscreen'
            };

            // Build elements
            const container = document.getElementById('hyperbook-viewer');
            container.innerHTML = `
                <div class="header-area">
                    <div class="theme-switch-container">
                        <button class="theme-switch" id="btn-toggle-view" title="${texts.toggleView}">📖</button>
                        <button class="theme-switch" id="btn-toggle-theme">🌙</button>
                    </div>
                    <div class="instruction-text" id="instruction-text">${texts.clickCover}</div>
                </div>

                <div class="book-viewport">
                    <div class="book-body" id="book-body" role="button" tabindex="0">
                        <!-- Cover Overlay -->
                        <div class="cover-overlay" id="cover" style="${!isPreset && this.themeColor ? `background: ${this.themeColor} !important;` : ''}">
                            ${this.coverImage ? `<img src="${this.coverImage}" alt="${this.title}" class="cover-image" />` : ''}
                            <div class="cover-title" id="coverTitle">${this.title}</div>
                            ${this.author ? `<div class="cover-author" id="coverAuthor">${this.author}</div>` : ''}
                        </div>

                        <!-- Inside Pages -->
                        <div class="book-content" id="book-content" style="opacity: 0;">
                            <!-- Left Page -->
                            <div class="page-side" id="page-left">
                                <div class="markdown-body left-markdown" id="left-text-area"></div>
                                <div class="page-number left-num" id="left-page-num"></div>
                            </div>
                            <!-- Right Page -->
                            <div class="page-side" id="page-right">
                                <div class="markdown-body" id="right-text-area"></div>
                                <div class="page-number right-num" id="right-page-num"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Control Panel -->
                <div class="control-panel">
                    <button class="control-btn" id="btn-first" title="${texts.btnFirst}">⇤</button>
                    <button class="control-btn" id="btn-prev" title="${texts.btnPrev}">◀</button>
                    <input type="range" id="page-slider" min="-1" value="-1" class="page-slider">
                    <button class="control-btn" id="btn-next" title="${texts.btnNext}">▶</button>
                    <button class="control-btn" id="btn-last" title="${texts.btnLast}">⇥</button>
                    <button class="control-btn" id="btn-fullscreen" title="${texts.btnFullscreen}">⛶</button>
                </div>

                <!-- Footer TOC Box -->
                <div class="footer-box" id="footer-box"></div>
            `;

            // Keep DOM references
            this.dom = {
                body: document.body,
                bookBody: container.querySelector('#book-body'),
                cover: container.querySelector('#cover'),
                content: container.querySelector('#book-content'),
                pageLeft: container.querySelector('#page-left'),
                pageRight: container.querySelector('#page-right'),
                leftText: container.querySelector('#left-text-area'),
                rightText: container.querySelector('#right-text-area'),
                leftPageNum: container.querySelector('#left-page-num'),
                rightPageNum: container.querySelector('#right-page-num'),
                btnToggleView: container.querySelector('#btn-toggle-view'),
                btnToggleTheme: container.querySelector('#btn-toggle-theme'),
                btnFirst: container.querySelector('#btn-first'),
                btnPrev: container.querySelector('#btn-prev'),
                btnNext: container.querySelector('#btn-next'),
                btnLast: container.querySelector('#btn-last'),
                btnFullscreen: container.querySelector('#btn-fullscreen'),
                slider: container.querySelector('#page-slider'),
                instruction: container.querySelector('#instruction-text'),
                footerBox: container.querySelector('#footer-box'),
                controlPanel: container.querySelector('.control-panel')
            };

            // Setup custom renderer for marked
            if (window.marked) {
                const renderer = new window.marked.Renderer();
                renderer.code = function(code, lang) {
                    let codeText = typeof code === 'object' ? code.text : code;
                    let codeLang = typeof code === 'object' ? code.lang : lang;
                    if (codeLang === 'mermaid') {
                        return `<div class="mermaid">${codeText}</div>`;
                    }
                    return `<pre><code>${codeText}</code></pre>`;
                };
                window.marked.use({ renderer, breaks: true });
            }
        }

        initMermaid() {
            if (window.mermaid) {
                window.mermaid.initialize({
                    startOnLoad: false,
                    theme: this.uiTheme === 'dark' ? 'dark' : 'default',
                    securityLevel: 'loose'
                });
            }
        }

        renderPage(content) {
            if (!content) return '';
            
            let processed = content.split('\n').map(line => {
                const trimmed = line.trim();
                const videoMatch = trimmed.match(/^video:\s*(.*)/);
                if (videoMatch) {
                    const videoUrl = videoMatch[1].trim();
                    return `<div class="video-container"><iframe src="${this.getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
                }
                return line;
            }).join('\n');

            processed = processed.replace(/(\n{2,})/g, (match, p1, offset, string) => {
                const before = string.substring(0, offset).trimEnd();
                const after = string.substring(offset + match.length).trimStart();
                if (before.endsWith('>') || after.startsWith('<') || after === '') {
                    return match;
                }
                return '<br>'.repeat(match.length - 1) + '\n';
            });
            
            if (window.marked) {
                let html = window.marked.parse(processed);
                html = html.replace(/src="books\//g, 'src="/books/');
                return html;
            }
            return content;
        }

        getEmbedUrl(url) {
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

        getLeftPageNum() {
            if (this.currentIndex === -1) return "";
            if (this.authorBio && this.currentIndex === this.getTotalPages()) return "";
            if (this.insertToc && this.currentIndex === 0) return "";
            const dataIndex = this.insertToc ? this.currentIndex - 1 : this.currentIndex;
            return (dataIndex * 2 + 1).toString();
        }

        getRightPageNum() {
            if (this.currentIndex === -1) return "";
            if (this.authorBio && this.currentIndex === this.getTotalPages()) return "";
            if (this.insertToc && this.currentIndex === 0) return "";
            const dataIndex = this.insertToc ? this.currentIndex - 1 : this.currentIndex;
            return (dataIndex * 2 + 2).toString();
        }

        getProgressText() {
            if (this.currentIndex === -1) return "Cover";
            if (this.authorBio && this.currentIndex === this.getTotalPages()) return "Back Cover";
            if (this.insertToc && this.currentIndex === 0) return "Contents";
            const dataIndex = this.insertToc ? this.currentIndex - 1 : this.currentIndex;
            return `${dataIndex + 1} / ${this.spreads.length}`;
        }

        bindEvents() {
            // Theme switches
            this.dom.btnToggleView.addEventListener('click', () => this.toggleViewMode());
            this.dom.btnToggleTheme.addEventListener('click', () => this.toggleTheme());
            
            // Slider and Panel Buttons
            this.dom.slider.addEventListener('input', (e) => {
                this.currentIndex = parseInt(e.target.value);
                this.currentSubPage = 0;
                this.updateUI();
            });
            
            this.dom.btnFirst.addEventListener('click', () => {
                this.currentIndex = -1;
                this.currentSubPage = 0;
                this.updateUI();
            });
            this.dom.btnPrev.addEventListener('click', () => this.goPrev());
            this.dom.btnNext.addEventListener('click', () => this.goNext());
            this.dom.btnLast.addEventListener('click', () => {
                this.currentIndex = this.getTotalPages();
                this.currentSubPage = 0;
                this.updateUI();
            });
            this.dom.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
            
            // Click inside Book (Page turn)
            this.dom.bookBody.addEventListener('click', (e) => {
                // Prevent page turn when user is selecting text
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) {
                    return;
                }

                if (e.target.closest('a') || e.target.closest('.control-panel')) {
                    return;
                }
                
                const isVertical = this.viewMode === 'vertical';
                if (this.currentIndex === -1) {
                    this.currentIndex = 0;
                    this.currentSubPage = 0;
                    this.updateUI();
                    return;
                }

                const rect = this.dom.bookBody.getBoundingClientRect();
                const x = e.clientX - rect.left;

                if (x > rect.width / 2) {
                    // Right Click: Next
                    if (isVertical) {
                        if (this.currentSubPage === 0) {
                            this.currentSubPage = 1;
                        } else {
                            if (this.currentIndex < this.getTotalPages()) {
                                this.currentIndex++;
                                this.currentSubPage = 0;
                            } else {
                                this.currentIndex = -1;
                                this.currentSubPage = 0;
                            }
                        }
                    } else {
                        if (this.currentIndex < this.getTotalPages()) {
                            this.currentIndex++;
                        } else {
                            this.currentIndex = -1;
                        }
                    }
                } else {
                    // Left Click: Prev
                    if (isVertical) {
                        if (this.currentSubPage === 1) {
                            this.currentSubPage = 0;
                        } else {
                            if (this.currentIndex > 0) {
                                this.currentIndex--;
                                this.currentSubPage = 1;
                            } else {
                                this.currentIndex = -1;
                                this.currentSubPage = 0;
                            }
                        }
                    } else {
                        if (this.currentIndex > 0) {
                            this.currentIndex--;
                        } else {
                            this.currentIndex = -1;
                        }
                    }
                }
                this.updateUI();
            });

            // Fullscreen change listener
            document.addEventListener('fullscreenchange', () => {
                this.isFullscreen = !!document.fullscreenElement;
                this.updateUI();
            });

            // Handle broken image formatting
            document.addEventListener('error', (e) => {
                if (e.target.tagName === 'IMG') {
                    e.target.classList.add('broken-image');
                }
            }, true);
        }

        goPrev() {
            if (this.viewMode === 'vertical') {
                if (this.currentSubPage === 1) {
                    this.currentSubPage = 0;
                } else if (this.currentIndex > -1) {
                    this.currentIndex--;
                    this.currentSubPage = (this.currentIndex >= 0 && this.currentIndex < this.getTotalPages()) ? 1 : 0;
                }
            } else if (this.currentIndex > -1) {
                this.currentIndex--;
            }
            this.updateUI();
        }

        goNext() {
            if (this.viewMode === 'vertical') {
                if (this.currentIndex >= 0 && this.currentIndex <= this.getTotalPages() && this.currentSubPage === 0) {
                    this.currentSubPage = 1;
                } else if (this.currentIndex < this.getTotalPages()) {
                    this.currentIndex++;
                    this.currentSubPage = 0;
                }
            } else if (this.currentIndex < this.getTotalPages()) {
                this.currentIndex++;
            }
            this.updateUI();
        }

        toggleViewMode() {
            this.viewMode = this.viewMode === 'spread' ? 'vertical' : 'spread';
            this.currentSubPage = 0;
            this.updateUI();
        }

        toggleTheme() {
            this.uiTheme = this.uiTheme === 'dark' ? 'light' : 'dark';
            this.dom.body.setAttribute('data-theme', this.uiTheme);
            this.dom.btnToggleTheme.textContent = this.uiTheme === 'dark' ? '☀️' : '🌙';
            this.initMermaid();
            this.renderMermaid();
        }

        toggleFullscreen() {
            const elem = document.documentElement;
            if (!document.fullscreenElement) {
                elem.requestFullscreen().catch(err => {
                    console.error(`Fullscreen error: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        }

        jumpToPage(index) {
            this.currentIndex = index;
            this.currentSubPage = 0;
            this.updateUI();
        }

        handleInsertTocChange(isChecked) {
            const oldTotal = this.getTotalPages();
            this.insertToc = isChecked;
            this.buildTocItems();
            
            if (this.currentIndex >= 0) {
                if (isChecked && this.currentIndex < oldTotal) {
                    this.currentIndex = this.currentIndex + 1;
                } else if (!isChecked && this.currentIndex > 0) {
                    this.currentIndex = this.currentIndex - 1;
                } else if (!isChecked && this.currentIndex === 0) {
                    this.currentIndex = -1;
                }
            }
            this.updateUI();
        }

        updateUI() {
            const isOpened = this.currentIndex !== -1;
            
            // Update mode class to container body
            if (this.viewMode === 'vertical') {
                this.dom.body.classList.add('vertical-mode');
                this.dom.btnToggleView.textContent = '📖';
            } else {
                this.dom.body.classList.remove('vertical-mode');
                this.dom.btnToggleView.textContent = '📃';
            }

            // Adjust Book opened state
            const controlPanel = this.dom.controlPanel;
            if (isOpened) {
                this.dom.bookBody.classList.add('opened');
                if (controlPanel) controlPanel.classList.add('opened');
                this.dom.cover.style.transform = 'rotateY(-110deg)';
                this.dom.cover.style.opacity = '0';
                this.dom.cover.style.pointerEvents = 'none';
                this.dom.content.style.opacity = '1';
                this.dom.instruction.textContent = '';
            } else {
                this.dom.bookBody.classList.remove('opened');
                if (controlPanel) controlPanel.classList.remove('opened');
                this.dom.cover.style.transform = 'none';
                this.dom.cover.style.opacity = '1';
                this.dom.cover.style.pointerEvents = 'auto';
                this.dom.content.style.opacity = '0';
                this.dom.instruction.textContent = 'Click to read';
            }

            // Render current spread content
            if (isOpened) {
                this.renderPagesContent();
            }

            // Update Slider settings
            const total = this.getTotalPages();
            this.dom.slider.max = total;
            this.dom.slider.value = this.currentIndex;

            // Render Footer TOC or Toc Controller
            this.renderFooterToc();

            // Adjust Fullscreen scale
            this.adjustScale();

            // Update Fullscreen Button Icon
            if (this.dom.btnFullscreen) {
                this.dom.btnFullscreen.textContent = this.isFullscreen ? '↩︎' : '⛶';
            }

            // Render Diagrams
            this.renderMermaid();
        }

        renderPagesContent() {
            const leftVisible = (this.viewMode === 'spread' || this.currentSubPage === 0);
            const rightVisible = (this.viewMode === 'spread' || this.currentSubPage === 1);
            
            this.dom.pageLeft.style.display = leftVisible ? 'flex' : 'none';
            this.dom.pageRight.style.display = rightVisible ? 'flex' : 'none';

            // Left Page content
            if (leftVisible) {
                if (this.authorBio && this.currentIndex === this.getTotalPages()) {
                    // Author bio photo page
                    this.dom.leftText.innerHTML = `
                        <div class="author-photo-container">
                            <img src="${this.normalizePath(this.authorImage || '/static/books/author_avatar.png')}" alt="Photo" style="width: auto !important; height: auto !important; max-width: 100% !important; max-height: 100% !important; border-radius: 50%; object-fit: cover; box-shadow: 0 6px 15px rgba(0,0,0,0.15);" />
                        </div>
                    `;
                } else if (this.insertToc && this.currentIndex === 0) {
                    // Inline TOC left page is empty or layout placeholder
                    this.dom.leftText.innerHTML = '';
                } else {
                    const dataIndex = this.insertToc ? this.currentIndex - 1 : this.currentIndex;
                    const spread = this.spreads[dataIndex];
                    this.dom.leftText.innerHTML = spread ? this.renderPage(spread.leftMarkdown) : '';
                }
                this.dom.leftPageNum.textContent = this.getLeftPageNum();
            }

            // Right Page content
            if (rightVisible) {
                if (this.authorBio && this.currentIndex === this.getTotalPages()) {
                    // Author bio text page
                    if (window.marked) {
                        let html = window.marked.parse(this.authorBio);
                        html = html.replace(/src="books\//g, 'src="/books/');
                        this.dom.rightText.innerHTML = html;
                    } else {
                        this.dom.rightText.textContent = this.authorBio;
                    }
                } else if (this.insertToc && this.currentIndex === 0) {
                    // Render Table of Contents on Right page
                    this.dom.rightText.innerHTML = this.getInlineTocHtml();
                    this.bindTocJumps();
                } else {
                    const dataIndex = this.insertToc ? this.currentIndex - 1 : this.currentIndex;
                    const spread = this.spreads[dataIndex];
                    this.dom.rightText.innerHTML = spread ? this.renderPage(spread.rightMarkdown) : '';
                }
                this.dom.rightPageNum.textContent = this.getRightPageNum();
            }
        }

        getInlineTocHtml() {
            let listItemsHtml = this.tocItems.map(item => `
                <li>
                    <a href="javascript:void(0)" data-jump="${item.jumpIndex}">
                        <span class="toc-title">${item.title}</span>
                        <span class="toc-dots"></span>
                        <span class="toc-page">${item.pageStr}</span>
                    </a>
                </li>
            `).join('');

            return `
                <div class="book-toc-container">
                    <h2>Contents</h2>
                    <ul class="book-toc-list">
                        ${listItemsHtml}
                    </ul>
                </div>
            `;
        }

        bindTocJumps() {
            const jumpLinks = this.dom.rightText.querySelectorAll('a[data-jump]');
            jumpLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const jumpIndex = parseInt(link.getAttribute('data-jump'));
                    this.jumpToPage(jumpIndex);
                });
            });
        }

        renderFooterToc() {
            if (this.insertToc) {
                this.dom.footerBox.innerHTML = `
                    <div style="max-width: 494px; margin: 0 auto; text-align: center;">
                        <button class="theme-switch" style="padding: 8px 16px; font-size: 0.95rem; border-radius: 20px; cursor: pointer;" id="btn-restore-toc">
                            Close
                        </button>
                    </div>
                `;
                document.getElementById('btn-restore-toc').addEventListener('click', () => {
                    this.handleInsertTocChange(false);
                });
            } else {
                let listItemsHtml = this.tocItems.map(item => `
                    <li>
                        <a href="javascript:void(0)" data-jump="${item.jumpIndex}">
                            <span class="toc-title">${item.title}</span>
                            <span class="toc-dots"></span>
                            <span class="toc-page">${item.pageStr}</span>
                        </a>
                    </li>
                `).join('');

                this.dom.footerBox.innerHTML = `
                    <div class="book-toc-container" style="max-width: 494px; margin: 0 auto; text-align: left; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid var(--text-color); padding-bottom: 6px;">
                            <h2 style="margin: 0; font-size: 1.3rem;">Contents</h2>
                            <label class="toc-checkbox-label" style="font-size: 0.9rem; opacity: 0.8; margin-left: auto; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="checkbox-toc-insert" /> Add Contents page
                            </label>
                        </div>
                        <ul class="book-toc-list" style="display: block;">
                            ${listItemsHtml}
                        </ul>
                    </div>
                `;
                
                const checkbox = document.getElementById('checkbox-toc-insert');
                checkbox.addEventListener('change', (e) => {
                    this.handleInsertTocChange(e.target.checked);
                });

                const jumpLinks = this.dom.footerBox.querySelectorAll('a[data-jump]');
                jumpLinks.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const jumpIndex = parseInt(link.getAttribute('data-jump'));
                        this.jumpToPage(jumpIndex);
                    });
                });
            }
        }

        adjustScale() {
            if (!this.dom.bookBody) return;
            if (this.viewMode === 'vertical') {
                this.dom.bookBody.style.transform = '';
                this.dom.bookBody.style.transformOrigin = '';
                this.dom.bookBody.style.margin = '';
                return;
            }

            if (this.isFullscreen) {
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                const availableHeight = viewportHeight - 75;
                const availableWidth = viewportWidth - 40;
                const bookWidth = 1040;
                const bookHeight = 715;
                const scaleX = availableWidth / bookWidth;
                const scaleY = availableHeight / bookHeight;
                const scale = Math.min(scaleX, scaleY);
                
                this.dom.bookBody.style.transform = `scale(${scale})`;
                this.dom.bookBody.style.transformOrigin = 'center center';
                this.dom.bookBody.style.margin = '0';
            } else {
                this.dom.bookBody.style.transform = '';
                this.dom.bookBody.style.transformOrigin = '';
                this.dom.bookBody.style.margin = '';
            }
        }

        renderMermaid() {
            if (window.mermaid) {
                try {
                    const mermaidDivs = document.querySelectorAll('.mermaid');
                    if (mermaidDivs.length > 0) {
                        window.mermaid.init(undefined, mermaidDivs);
                    }
                } catch (e) {
                    console.error("Mermaid render error:", e);
                }
            }
        }
    }

    // Auto-instantiate
    document.addEventListener('DOMContentLoaded', () => {
        window.hyperBook = new HyperBookViewer();
    });
})();
