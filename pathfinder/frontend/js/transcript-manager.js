// Transcript Manager
class TranscriptManager {
    constructor() {
        // Add a flag for local storage fallback
        this.useLocalStorage = false;  // Set to true for local-only development
        this.API_BASE_URL = 'http://127.0.0.1:5000';  // Base URL for API calls
        this.transcripts = [];
        this.selectedTranscript = null;
        this.isVisible = false;
        
        // DOM elements
        this.container = document.getElementById('transcript-manager-modal');
        this.listContainer = document.getElementById('transcript-list');
        this.contentContainer = document.getElementById('transcript-content');
        this.searchInput = document.getElementById('transcript-search');
        this.listSection = document.querySelector('.transcript-list-container');
        this.contextMenu = null;
        
        // Window management
        this.window = null;
        this.windowContent = null;
        
        // Buttons
        this.manageButton = document.getElementById('manage-transcripts');
        this.closeButton = document.getElementById('close-transcript-manager');
        this.newButton = document.getElementById('new-transcript');
        this.importButton = document.getElementById('import-transcript');
        this.exportButton = document.getElementById('export-transcript');
        this.renameButton = document.getElementById('rename-transcript');
        this.duplicateButton = document.getElementById('duplicate-transcript');
        this.deleteButton = document.getElementById('delete-transcript');
        
        this.bindEvents();
        this.init();
    }
    
    async init() {
        try {
            await this.loadTranscripts();
            document.getElementById('manage-transcripts').addEventListener('click', () => this.openManager());
        } catch (error) {
            console.error('Error initializing transcript manager:', error);
        }
    }
    
    bindEvents() {
        // Modal controls
        this.manageButton.addEventListener('click', () => this.openManager());
        
        // Context menu actions
        document.addEventListener('click', (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
    }
    
    async loadTranscripts() {
        try {
            if (this.useLocalStorage) {
                // Use localStorage for development if API is not available
                try {
                    const storedTranscripts = localStorage.getItem('transcripts');
                    if (storedTranscripts) {
                        this.transcripts = JSON.parse(storedTranscripts);
                    } else {
                        // Default sample data
                        this.transcripts = [
                            {
                                id: 'transcript-1',
                                name: 'Sample Conversation',
                                date: new Date().toISOString(),
                                messages: [
                                    { role: 'system', content: 'Welcome to PathFinder. How can I help you today?' },
                                    { role: 'user', content: 'Tell me about this application.' },
                                    { role: 'assistant', content: 'This is PathFinder, an AI-powered chat application that helps you with various tasks. You can have conversations, save them as transcripts, and more.' }
                                ]
                            }
                        ];
                        await this.saveTranscripts();
                    }
                } catch (error) {
                    console.error('Error loading transcripts from localStorage:', error);
                    this.transcripts = [];
                }
                return;
            }
            
            // Otherwise use the API
            try {
                console.log('Attempting to load transcripts from API...');
                const response = await fetch(`${this.API_BASE_URL}/api/transcripts`, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': window.location.origin
                    },
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    console.error('API response not OK:', response.status, response.statusText);
                    throw new Error(`Failed to load transcripts: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log('Received transcripts from API:', data);
                
                if (!data.transcripts || !Array.isArray(data.transcripts)) {
                    console.error('Invalid API response format:', data);
                    throw new Error('Invalid API response format');
                }
                
                this.transcripts = data.transcripts;
                
                // Sort transcripts by last_modified time (most recent first)
                this.transcripts.sort((a, b) => {
                    const dateA = new Date(a.last_modified || a.date);
                    const dateB = new Date(b.last_modified || b.date);
                    return dateB - dateA;
                });
                
                this.renderTranscriptList();
                
                // Check if we have transcripts and if the UI is ready for selection
                if (this.transcripts.length > 0 && this.listContainer) {
                    this.selectTranscript(this.transcripts[0].id);
                }
            } catch (error) {
                console.error('Error loading transcripts from API:', error);
                this.showNotification(`Failed to load transcripts from API: ${error.message}`, true);
                
                // Fallback to localStorage
                console.log('Falling back to localStorage...');
                this.useLocalStorage = true;
                await this.loadTranscripts();
            }
        } catch (error) {
            console.error('Critical error in loadTranscripts:', error);
            this.showNotification('Failed to load transcripts', true);
            this.transcripts = [];
        }
    }
    
    async saveTranscripts() {
        if (this.useLocalStorage) {
            try {
                localStorage.setItem('transcripts', JSON.stringify(this.transcripts));
            } catch (error) {
                console.error('Error saving transcripts to localStorage:', error);
                this.showNotification('Failed to save transcripts', true);
            }
            return;
        }
        
        // API-based saving is handled by individual API calls
        console.log('Using direct API calls for transcript operations');
    }
    
    createWindow() {
        // Use the withWindowManager helper to safely access the window manager
        this.withWindowManager(windowManager => {
            if (this.window) return; // Window already exists
            
            // Create window
            const windowWidth = Math.floor(window.innerWidth * 0.8);
            const windowHeight = Math.floor(window.innerHeight * 0.8);
            
            this.window = windowManager.createWindow({
                title: 'Transcript Manager',
                width: windowWidth,
                height: windowHeight,
                minWidth: 600,
                minHeight: 400,
                x: 'center',
                y: 'center',
                onClose: () => {
                    this.window = null;
                    this.windowContent = null;
                    this.hideContextMenu();
                }
            });
            
            // Create window content
            this.windowContent = document.createElement('div');
            this.windowContent.className = 'transcript-manager-content';
            this.windowContent.innerHTML = `
                <div class="transcript-manager-container">
                    <div class="transcript-list-container">
                        <div class="transcript-search">
                            <input type="text" placeholder="Search transcripts..." id="transcript-search">
                        </div>
                        <div class="transcript-list" id="transcript-list">
                            <!-- Transcript list will be populated here -->
                        </div>
                        <div class="transcript-list-footer">
                            <div class="transcript-list-controls">
                                <button class="icon-button" id="new-transcript" title="New Conversation">
                                    <svg viewBox="0 0 24 24" width="16" height="16">
                                        <path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                                    </svg>
                                </button>
                                <button class="icon-button" id="import-transcript" title="Import Transcript">
                                    <svg viewBox="0 0 24 24" width="16" height="16">
                                        <path fill="currentColor" d="M14,13V17H10V13H7L12,8L17,13M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z"/>
                                    </svg>
                                </button>
                                <button class="icon-button" id="export-transcript" title="Export Transcript">
                                    <svg viewBox="0 0 24 24" width="16" height="16">
                                        <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="transcript-content" id="transcript-content">
                        <!-- Transcript content will be displayed here -->
                    </div>
                </div>
            `;
            
            windowManager.setWindowContent(this.window, this.windowContent);
            
            // Update references to DOM elements
            this.listContainer = this.windowContent.querySelector('#transcript-list');
            this.contentContainer = this.windowContent.querySelector('#transcript-content');
            this.searchInput = this.windowContent.querySelector('#transcript-search');
            
            this.newButton = this.windowContent.querySelector('#new-transcript');
            this.importButton = this.windowContent.querySelector('#import-transcript');
            this.exportButton = this.windowContent.querySelector('#export-transcript');
            
            // Add some CSS to the footer
            const listFooter = this.windowContent.querySelector('.transcript-list-footer');
            if (listFooter) {
                listFooter.style.padding = '0';
                listFooter.style.display = 'flex';
                listFooter.style.justifyContent = 'flex-end';
                listFooter.style.borderTop = 'none';
                listFooter.style.marginTop = '0';
                listFooter.style.borderBottom = 'none';
            }
            
            const listControls = this.windowContent.querySelector('.transcript-list-controls');
            if (listControls) {
                listControls.style.display = 'flex';
                listControls.style.gap = '8px';
                listControls.style.margin = '0';
                listControls.style.border = 'none';
            }
            
            // Add CSS to the list container to ensure proper layout
            const listContainer = this.windowContent.querySelector('.transcript-list-container');
            if (listContainer) {
                listContainer.style.display = 'flex';
                listContainer.style.flexDirection = 'column';
                listContainer.style.height = '100%';
            }
            
            // Bind events
            this.bindWindowEvents();
            
            // Render transcript list
            this.renderTranscriptList();
            if (this.transcripts.length > 0) {
                this.selectTranscript(this.transcripts[0].id);
            }
            
            // Focus search input
            this.searchInput.focus();
        });
    }
    
    bindWindowEvents() {
        // Transcript operations
        this.newButton.addEventListener('click', () => this.createNewTranscript());
        this.importButton.addEventListener('click', () => this.importTranscript());
        this.exportButton.addEventListener('click', () => this.exportSelectedTranscript());
        
        // Search
        this.searchInput.addEventListener('input', (e) => this.searchTranscripts(e.target.value));
        
        // Keyboard shortcuts
        this.windowContent.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedTranscript) {
                this.deleteTranscript();
            }
        });
    }
    
    openManager() {
        this.loadTranscripts();
        
        if (this.window) {
            this.withWindowManager(windowManager => {
                // Restore if minimized, otherwise just focus
                if (this.window._windowManager && this.window._windowManager.isMinimized) {
                    windowManager.restoreWindow(this.window);
                } else {
                    // Just focus the window
                    windowManager.focusWindow(this.window);
                    // Make sure window is visible
                    this.window.style.display = 'flex';
                }
            });
        } else if (!this.window) {
            // Create a window since neither window nor container exists
            this.createWindow();
        }
    }
    
    closeManager() {
        // Hide context menu if open
        this.hideContextMenu();
        
        // If using window manager
        if (this.window) {
            this.withWindowManager(windowManager => {
                windowManager.closeWindow(this.window);
                this.window = null;
                this.windowContent = null;
            });
        } 
        // If using direct DOM manipulation
        else if (this.container) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }
    
    renderTranscriptList(filteredTranscripts = null) {
        if (!this.listContainer) return;
        
        const transcriptsToRender = filteredTranscripts || this.transcripts;
        this.listContainer.innerHTML = '';
        
        if (transcriptsToRender.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = filteredTranscripts ? 'No matching transcripts found' : 'No transcripts yet';
            this.listContainer.appendChild(emptyMessage);
            return;
        }
        
        transcriptsToRender.forEach(transcript => {
            const item = document.createElement('div');
            item.className = 'transcript-item';
            item.id = `transcript-item-${transcript.id}`;
            item.textContent = transcript.name;
            item.title = `${transcript.name} - ${new Date(transcript.date).toLocaleString()}`;
            
            if (this.selectedTranscript && transcript.id === this.selectedTranscript.id) {
                item.classList.add('selected');
            }
            
            // Event listeners
            item.addEventListener('click', () => this.selectTranscript(transcript.id));
            item.addEventListener('dblclick', () => this.loadTranscriptIntoChat(transcript.id));
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.selectTranscript(transcript.id);
                
                // Get position relative to the clicked item
                const rect = item.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                
                this.showContextMenu(x, y);
            });
            
            this.listContainer.appendChild(item);
        });
    }
    
    renderTranscriptContent(transcript) {
        if (!this.contentContainer) return;
        
        this.contentContainer.innerHTML = '';
        
        if (!transcript) return;
        
        // Calculate message statistics
        const userMessages = transcript.messages.filter(msg => msg.role === 'user').length;
        const assistantMessages = transcript.messages.filter(msg => msg.role === 'assistant').length;
        const totalMessages = userMessages + assistantMessages;
        const lastModified = new Date(transcript.last_modified || transcript.date);
        
        // Create header container
        const headerDiv = document.createElement('div');
        headerDiv.className = 'transcript-content-header';
        
        headerDiv.innerHTML = `
            <div class="header-main">
                <div class="header-left">
                    <h3>${transcript.name}</h3>
                </div>
                <div class="header-right">
                    <div class="header-stats">
                        <div class="stat-group">
                            <span class="stat-label">Messages</span>
                            <span class="stat-value">${totalMessages}</span>
                        </div>
                        <div class="stat-group">
                            <span class="stat-label">User</span>
                            <span class="stat-value">${userMessages}</span>
                        </div>
                        <div class="stat-group">
                            <span class="stat-label">Assistant</span>
                            <span class="stat-value">${assistantMessages}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="header-bottom">
                <div class="header-actions">
                    <button id="load-transcript" class="open-button">Open</button>
                    <button id="delete-transcript" class="danger-button">Delete</button>
                    <button id="commit-deletions" class="danger-button" style="display: none;">Delete Selected</button>
                </div>
                <div class="header-meta">
                    <div class="meta-group">
                        <span class="meta-label">Created:</span>
                        <span class="meta-value">${new Date(transcript.date).toLocaleString()}</span>
                    </div>
                    <div class="meta-group">
                        <span class="meta-label">Modified:</span>
                        <span class="meta-value">${lastModified.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .transcript-content-header {
                padding: 16px;
                border-bottom: 1px solid var(--border-color);
                background-color: var(--bg-secondary);
                display: flex;
                flex-direction: column;
                gap: 12px;
                position: sticky;
                top: 0;
                z-index: 10;
                backdrop-filter: blur(8px);
                background-color: rgba(var(--bg-secondary-rgb), 0.8);
            }
            .transcript-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background-color: var(--bg-primary);
                position: relative;
            }
            .transcript-messages {
                position: relative;
                z-index: 1;
            }
            .transcript-content-header .header-main {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 16px;
            }
            .transcript-content-header .header-left h3 {
                margin: 0;
                font-size: 20px;
                color: var(--text-primary);
                font-weight: 600;
            }
            .transcript-content-header .header-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
            }
            .transcript-content-header .header-stats {
                display: flex;
                gap: 24px;
                text-align: center;
            }
            .transcript-content-header .stat-group {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }
            .transcript-content-header .stat-label {
                font-size: 12px;
                color: var(--text-muted);
            }
            .transcript-content-header .stat-value {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-primary);
            }
            .transcript-content-header .header-bottom {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-top: 8px;
            }
            .transcript-content-header .header-actions {
                display: flex;
                gap: 8px;
            }
            .transcript-content-header .header-meta {
                display: flex;
                flex-direction: column;
                gap: 4px;
                align-items: flex-end;
            }
            .transcript-content-header .meta-group {
                display: flex;
                align-items: center;
                gap: 8px;
                justify-content: flex-end;
                width: 100%;
            }
            .transcript-content-header .meta-label {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-primary);
                min-width: 80px;
                text-align: right;
            }
            .transcript-content-header .meta-value {
                font-size: 12px;
                color: var(--text-primary);
            }
            .transcript-content-header .open-button {
                padding: 8px 16px;
                background-color: var(--bg-tertiary);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            }
            .transcript-content-header .open-button:hover {
                background-color: var(--hover-bg);
                border-color: var(--primary-color);
            }
            .transcript-content-header .danger-button {
                padding: 8px 16px;
                background-color: var(--error-color);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            .transcript-content-header .danger-button:hover {
                background-color: var(--error-hover);
            }
            .chat-message {
                position: relative;
                transition: opacity 0.2s;
            }
            .chat-message.selected-for-deletion {
                opacity: 0.5;
                background-color: var(--error-bg);
            }
            .chat-message.selected-for-deletion .message-content {
                opacity: 0.5;
            }
            .message-delete-button {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 4px;
                background: none;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                color: var(--text-muted);
                transition: all 0.2s;
                opacity: 0;
            }
            .chat-message:hover .message-delete-button,
            .chat-message.selected-for-deletion .message-delete-button {
                opacity: 1;
            }
            .message-delete-button:hover,
            .chat-message.selected-for-deletion .message-delete-button {
                color: var(--error-color);
            }
        `;
        document.head.appendChild(style);
        
        // Add elements to container
        this.contentContainer.appendChild(headerDiv);
        
        // Add event listeners
        const loadButton = headerDiv.querySelector('#load-transcript');
        const deleteButton = headerDiv.querySelector('#delete-transcript');
        const commitDeletionsButton = headerDiv.querySelector('#commit-deletions');
        
        // Store selected messages for deletion
        this.selectedMessagesForDeletion = new Set();
        
        loadButton.addEventListener('click', () => {
            this.loadTranscriptIntoChat(transcript.id);
        });
        
        deleteButton.addEventListener('click', () => {
            this.deleteTranscript();
        });
        
        commitDeletionsButton.addEventListener('click', () => {
            this.commitMessageDeletions();
        });
        
        // Add messages container
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'transcript-messages';
        this.contentContainer.appendChild(messagesContainer);
        
        // Add messages
        transcript.messages.forEach((message, index) => {
            if (message.role === 'system') return; // Skip system messages
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${message.role}`;
            messageDiv.dataset.messageIndex = index;
            
            // Create message content wrapper
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'message-content-wrapper';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            if (message.role === 'assistant') {
                // Process the content to handle tool results
                const parts = message.content.split(/(Tool Results from [^:]+:)/);
                let mainContent = '';
                let toolResults = [];
                
                for (let i = 0; i < parts.length; i++) {
                    if (i % 2 === 0) {
                        mainContent += parts[i];
                    } else {
                        toolResults.push({
                            header: parts[i],
                            content: parts[i + 1] || ''
                        });
                        i++; // Skip the content part as we've already processed it
                    }
                }
                
                // Initialize markdown-it
                const md = window.markdownit({
                    html: false,
                    linkify: true,
                    typographer: true,
                    highlight: function (str, lang) {
                        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                            try {
                                return window.hljs.highlight(str, { language: lang }).value;
                            } catch (__) {}
                        }
                        return ''; // Use external default escaping
                    }
                });
                
                // Add plugins if available
                if (window.markdownitEmoji) md.use(window.markdownitEmoji);
                if (window.markdownitTaskLists) md.use(window.markdownitTaskLists);
                
                // Render the main content
                const mainContentDiv = document.createElement('div');
                mainContentDiv.innerHTML = md.render(mainContent);
                contentDiv.appendChild(mainContentDiv);
                
                // Add tool results if any
                if (toolResults.length > 0) {
                    const toggleLink = document.createElement('a');
                    toggleLink.className = 'tool-results-toggle';
                    toggleLink.textContent = `Tool Results (${toolResults.length})`;
                    toggleLink.onclick = function(e) {
                        e.preventDefault();
                        const container = this.nextElementSibling;
                        container.classList.toggle('expanded');
                        this.classList.toggle('expanded');
                    };
                    contentDiv.appendChild(toggleLink);
                    
                    const resultsContainer = document.createElement('div');
                    resultsContainer.className = 'tool-results-container';
                    
                    toolResults.forEach(result => {
                        const resultDiv = document.createElement('div');
                        resultDiv.className = 'tool-result';
                        
                        const content = document.createElement('textarea');
                        content.className = 'tool-result-content';
                        content.value = result.content;
                        content.readOnly = true;
                        content.rows = 8; // Initial height
                        
                        resultDiv.appendChild(content);
                        resultsContainer.appendChild(resultDiv);
                    });
                    
                    contentDiv.appendChild(resultsContainer);
                }
            } else {
                const paragraph = document.createElement('p');
                paragraph.textContent = message.content;
                contentDiv.appendChild(paragraph);
            }
            
            // Add delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'message-delete-button';
            deleteButton.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                </svg>
            `;
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMessageForDeletion(messageDiv, index);
            });
            
            wrapperDiv.appendChild(contentDiv);
            wrapperDiv.appendChild(deleteButton);
            
            // Add timestamp if available
            if (message.timestamp) {
                const timestampDiv = document.createElement('div');
                timestampDiv.className = 'message-timestamp';
                
                // Format the timestamp
                const date = new Date(message.timestamp);
                const formattedDate = date.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                timestampDiv.textContent = formattedDate;
                wrapperDiv.appendChild(timestampDiv);
            }
            
            messageDiv.appendChild(wrapperDiv);
            messagesContainer.appendChild(messageDiv);
        });
    }
    
    async selectTranscript(id) {
        try {
            // Highlight the selected transcript in the UI
            if (this.listContainer) {
                const items = this.listContainer.querySelectorAll('.transcript-item');
                items.forEach(item => {
                    item.classList.toggle('selected', item.id === `transcript-item-${id}`);
                });
            }
            
            // First try to get from local cache
            const transcript = this.transcripts.find(t => t.id === id);
            if (!transcript) return;
            
            this.selectedTranscript = transcript;
            
            // If the transcript already has messages, render them directly
            if (transcript.messages && transcript.messages.length > 0) {
                this.renderTranscriptContent(transcript);
            } else {
                // Otherwise fetch the transcript content for viewing
                try {
                    // Show loading state
                    if (this.contentContainer) {
                        this.contentContainer.innerHTML = '<div class="loading-message">Loading transcript content...</div>';
                    }
                    
                    const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${id}/view`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        credentials: 'include'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    // Update the transcript in our local cache with the full data
                    const transcriptIndex = this.transcripts.findIndex(t => t.id === id);
                    if (transcriptIndex !== -1) {
                        this.transcripts[transcriptIndex].messages = data.messages;
                    }
                    
                    // Render the content
                    this.renderTranscriptContent({ 
                        ...transcript, 
                        messages: data.messages 
                    });
                } catch (error) {
                    console.error('Error fetching transcript for viewing:', error);
                    if (this.contentContainer) {
                        this.contentContainer.innerHTML = '<div class="error-message">Failed to load transcript content</div>';
                    }
                }
            }
            
            // Update the last_modified time for this transcript when selected
            fetch(`${this.API_BASE_URL}/api/transcripts/${id}/touch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include'
            }).catch(err => console.error('Error updating transcript access time:', err));
        } catch (error) {
            console.error('Error selecting transcript:', error);
        }
    }
    
    searchTranscripts(query) {
        // Remove search functionality
        return;
    }
    
    showContextMenu(x, y) {
        // Create and show the context menu
        this.createContextMenu(x, y);
    }
    
    createContextMenu(x, y) {
        if (this.contextMenu) {
            this.contextMenu.remove();
        }
        
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        
        // Add essential styling to ensure visibility and consistency with file explorer
        this.contextMenu.style.position = 'fixed';
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.zIndex = '9999';
        this.contextMenu.style.minWidth = '180px';
        this.contextMenu.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        this.contextMenu.style.backgroundColor = 'var(--bg-secondary)';
        this.contextMenu.style.border = '1px solid var(--border-color)';
        this.contextMenu.style.borderRadius = '6px';
        this.contextMenu.style.overflow = 'hidden';
        this.contextMenu.style.fontSize = '13px';
        this.contextMenu.style.color = 'var(--text-primary)';
        this.contextMenu.style.padding = '4px';
        
        const items = [
            {
                label: 'New Conversation',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>',
                action: () => this.createNewTranscript()
            },
            {
                label: 'Import',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14,13V17H10V13H7L12,8L17,13M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z"/></svg>',
                action: () => this.importTranscript()
            },
            {
                label: 'Export',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14,13V17H10V13H7L12,8L17,13M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z"/></svg>',
                action: () => this.exportSelectedTranscript()
            },
            { type: 'separator' },
            {
                label: 'Rename',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.41,5.8L17.2,4.59C16.41,3.8 15.14,3.8 14.34,4.59L4.59,14.34L3,21L9.66,19.41L19.41,9.66C20.2,8.86 20.2,7.59 19.41,6.8M6.21,18.21L5.08,17.08L13.6,8.56L14.74,9.7L6.21,18.21M7.45,16.96L15.97,8.44L16.74,9.21L8.22,17.73L7.45,16.96Z"/></svg>',
                action: () => this.renameTranscript()
            },
            {
                label: 'Duplicate',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>',
                action: () => this.duplicateTranscript()
            },
            { type: 'separator' },
            {
                label: 'Delete',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>',
                action: () => this.deleteTranscript(),
                danger: true
            }
        ];
        
        items.forEach(item => {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                separator.style.height = '1px';
                separator.style.backgroundColor = 'var(--border-color, #444)';
                separator.style.margin = '4px 0';
                this.contextMenu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                
                // Add styling to menu items to match file explorer
                menuItem.style.padding = '6px 12px';
                menuItem.style.display = 'flex';
                menuItem.style.alignItems = 'center';
                menuItem.style.cursor = 'pointer';
                menuItem.style.whiteSpace = 'nowrap';
                menuItem.style.userSelect = 'none';
                
                // Hover effect
                menuItem.style.transition = 'background-color 0.15s';
                
                if (item.danger) {
                    menuItem.classList.add('danger');
                    menuItem.style.color = 'var(--error-color, #ff5252)';
                }
                
                menuItem.innerHTML = `
                    <div class="icon" style="width: 20px; height: 20px; margin-right: 8px; opacity: 0.9; display: flex; align-items: center; justify-content: center;">${item.icon}</div>
                    <span>${item.label}</span>
                `;
                
                // Add hover effect via JavaScript
                menuItem.addEventListener('mouseover', () => {
                    menuItem.style.backgroundColor = 'var(--hover-color, #3a3a3a)';
                });
                
                menuItem.addEventListener('mouseout', () => {
                    menuItem.style.backgroundColor = '';
                });
                
                menuItem.addEventListener('click', () => {
                    item.action();
                    this.hideContextMenu();
                });
                this.contextMenu.appendChild(menuItem);
            }
        });
        
        document.body.appendChild(this.contextMenu);
        
        // Ensure menu stays within viewport boundaries
        const menuRect = this.contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (menuRect.right > viewportWidth) {
            this.contextMenu.style.left = `${x - menuRect.width}px`;
        }
        
        if (menuRect.bottom > viewportHeight) {
            this.contextMenu.style.top = `${y - menuRect.height}px`;
        }
        
        // Close context menu when clicking outside
        const closeContextMenu = (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
                document.removeEventListener('click', closeContextMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }
    
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }
    
    async createNewTranscript(defaultName = null) {
        if (this.useLocalStorage) {
            try {
                const name = defaultName || prompt('Enter a name for the new transcript:', 'Untitled');
                if (!name) {
                    // If user cancels or provides empty name, use "Untitled"
                    const newTranscript = {
                        id: `transcript-${Date.now()}`,
                        name: 'Untitled',
                        date: new Date().toISOString(),
                        messages: [
                            { role: 'system', content: 'Welcome to PathFinder. How can I help you today?' }
                        ],
                        last_modified: new Date().toISOString()
                    };
                    
                    this.transcripts.unshift(newTranscript);
                    await this.saveTranscripts();
                    
                    this.renderTranscriptList();
                    this.selectTranscript(newTranscript.id);
                    this.showNotification('New transcript created');
                    return;
                }
                
                const newTranscript = {
                    id: `transcript-${Date.now()}`,
                    name: name,
                    date: new Date().toISOString(),
                    messages: [
                        { role: 'system', content: 'Welcome to PathFinder. How can I help you today?' }
                    ],
                    last_modified: new Date().toISOString()
                };
                
                this.transcripts.unshift(newTranscript);
                await this.saveTranscripts();
                
                this.renderTranscriptList();
                this.selectTranscript(newTranscript.id);
                this.showNotification('New transcript created');
            } catch (error) {
                console.error('Error creating transcript locally:', error);
                this.showNotification('Failed to create transcript', true);
            }
            return;
        }
        
        // Use the API
        try {
            const name = defaultName || prompt('Enter a name for the new transcript:', 'Untitled');
            if (!name) {
                // If user cancels or provides empty name, use "Untitled"
                const response = await fetch(`${this.API_BASE_URL}/api/transcripts`, {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ name: 'Untitled' })
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to create transcript: ${response.statusText}`);
                }
                
                const data = await response.json();
                this.transcripts.unshift(data.transcript);
                
                this.renderTranscriptList();
                this.selectTranscript(data.transcript.id);
                this.showNotification('New transcript created');
                return;
            }
            
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create transcript: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.transcripts.unshift(data.transcript);
            
            this.renderTranscriptList();
            this.selectTranscript(data.transcript.id);
            this.showNotification('New transcript created');
        } catch (error) {
            console.error('Error creating transcript via API:', error);
            this.showNotification('Failed to create transcript, falling back to local storage', true);
            
            // Fallback to localStorage
            this.useLocalStorage = true;
            await this.createNewTranscript(defaultName);
        }
    }
    
    async renameTranscript() {
        if (!this.selectedTranscript) return;
        
        if (this.useLocalStorage) {
            try {
                const newName = prompt('Enter a new name for this transcript:', this.selectedTranscript.name);
                if (!newName || newName === this.selectedTranscript.name) return;
                
                const index = this.transcripts.findIndex(t => t.id === this.selectedTranscript.id);
                if (index !== -1) {
                    this.transcripts[index].name = newName;
                    this.selectedTranscript.name = newName;
                    await this.saveTranscripts();
                }
                
                this.renderTranscriptList();
                this.showNotification('Transcript renamed');
            } catch (error) {
                console.error('Error renaming transcript locally:', error);
                this.showNotification('Failed to rename transcript', true);
            }
            return;
        }
        
        // Use the API
        try {
            const newName = prompt('Enter a new name for this transcript:', this.selectedTranscript.name);
            if (!newName || newName === this.selectedTranscript.name) return;
            
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${this.selectedTranscript.id}`, {
                method: 'PUT',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name: newName })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to rename transcript: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update the local copy
            const index = this.transcripts.findIndex(t => t.id === this.selectedTranscript.id);
            if (index !== -1) {
                this.transcripts[index] = data.transcript;
                this.selectedTranscript = data.transcript;
            }
            
            this.renderTranscriptList();
            this.showNotification('Transcript renamed');
        } catch (error) {
            console.error('Error renaming transcript via API:', error);
            this.showNotification('Failed to rename via API, using local storage', true);
            
            // Fallback to localStorage
            this.useLocalStorage = true;
            await this.renameTranscript();
        }
    }
    
    async duplicateTranscript() {
        if (!this.selectedTranscript) return;
        
        try {
            const duplicateName = `${this.selectedTranscript.name} (Copy)`;
            
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name: duplicateName,
                    messages: this.selectedTranscript.messages
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to duplicate transcript: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.transcripts.unshift(data.transcript);
            
            this.renderTranscriptList();
            this.selectTranscript(data.transcript.id);
            this.showNotification('Transcript duplicated');
        } catch (error) {
            console.error('Error duplicating transcript:', error);
            this.showNotification('Failed to duplicate transcript', true);
        }
    }
    
    async deleteTranscript() {
        if (!this.selectedTranscript) return;
        
        try {
            const confirmation = confirm(`Are you sure you want to delete "${this.selectedTranscript.name}"?`);
            if (!confirmation) return;
            
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${this.selectedTranscript.id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete transcript: ${response.statusText}`);
            }
            
            // Remove from local array
            const indexToRemove = this.transcripts.findIndex(t => t.id === this.selectedTranscript.id);
            if (indexToRemove !== -1) {
                this.transcripts.splice(indexToRemove, 1);
            }
            
            this.selectedTranscript = null;
            this.renderTranscriptList();
            
            if (this.transcripts.length > 0) {
                this.selectTranscript(this.transcripts[0].id);
            } else if (this.contentContainer) {
                this.contentContainer.innerHTML = '';
            }
            
            this.showNotification('Transcript deleted');
        } catch (error) {
            console.error('Error deleting transcript:', error);
            this.showNotification('Failed to delete transcript', true);
        }
    }
    
    async loadTranscriptIntoChat(transcriptId) {
        try {
            // Check if this transcript is already loaded in the chat interface
            if (window.chatInterface.currentTranscriptId === transcriptId) {
                // If it's the same transcript, just close the manager and return
                this.closeManager();
                return;
            }

            // Store the original saveMessageToTranscript function
            const originalSaveMessageToTranscript = window.chatInterface.saveMessageToTranscript;

            try {
                // Temporarily disable message saving
                window.chatInterface.saveMessageToTranscript = () => Promise.resolve(true);
                
                // Clear chat interface first to prevent message accumulation
                if (typeof window.chatInterface.clearMessages === 'function') {
                    window.chatInterface.clearMessages();
                } else {
                    console.warn('clearMessages method not found on chatInterface');
                    // Fallback: manually clear messages if possible
                    if (window.chatInterface.messagesContainer) {
                        window.chatInterface.messagesContainer.innerHTML = '';
                    }
                    if (Array.isArray(window.chatInterface.messages)) {
                        window.chatInterface.messages = [];
                    }
                }
                
                // Try to load transcript from the API
                const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${transcriptId}/load`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (!data.success || !data.messages) {
                    throw new Error('Invalid response from API');
                }
                
                // Update current transcript info in chat interface
                window.chatInterface.currentTranscriptId = transcriptId;
                window.chatInterface.currentTranscriptName = data.name;
                if (window.chatInterface.transcriptNameDisplay) {
                    window.chatInterface.transcriptNameDisplay.textContent = data.name;
                }
                window.chatInterface.hasActivity = true;
                
                // Add messages to the UI
                for (const message of data.messages) {
                    if (message.role !== 'system') { // Skip system messages
                        await window.chatInterface.addMessage(message.role, message.content, message.timestamp);
                    }
                }
                
                // Close the transcript manager
                this.closeManager();
                
            } catch (apiError) {
                console.error('API error loading transcript:', apiError);
                
                // If API fails, try to get transcript from local cache
                const localTranscript = this.transcripts.find(t => t.id === transcriptId);
                
                if (localTranscript && localTranscript.messages && localTranscript.messages.length > 0) {
                    // Update current transcript info
                    window.chatInterface.currentTranscriptId = transcriptId;
                    window.chatInterface.currentTranscriptName = localTranscript.name;
                    if (window.chatInterface.transcriptNameDisplay) {
                        window.chatInterface.transcriptNameDisplay.textContent = localTranscript.name;
                    }
                    window.chatInterface.hasActivity = true;
                    
                    // Add messages to the UI
                    for (const message of localTranscript.messages) {
                        if (message.role !== 'system') { // Skip system messages
                            await window.chatInterface.addMessage(message.role, message.content, message.timestamp);
                        }
                    }
                    
                    // Close the transcript manager
                    this.closeManager();
                } else {
                    throw new Error('Failed to load transcript from both API and local cache');
                }
            } finally {
                // Always restore the original saveMessageToTranscript function
                // This ensures it gets restored even if there's an error
                window.chatInterface.saveMessageToTranscript = originalSaveMessageToTranscript;
            }
        } catch (error) {
            console.error('Error loading transcript into chat:', error);
            // Use a more reliable notification approach
            if (typeof this.showNotification === 'function') {
                this.showNotification('Failed to load transcript', true);
            } else {
                console.error('Failed to load transcript:', error.message);
                alert('Failed to load transcript: ' + error.message);
            }
        }
    }
    
    async importTranscript() {
        // Create a file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        
        fileInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    // Validate the imported data
                    if (!importedData.name || !Array.isArray(importedData.messages)) {
                        throw new Error('Invalid transcript format');
                    }
                    
                    // Send to the API for importing
                    const response = await fetch(`${this.API_BASE_URL}/api/transcripts/import`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ transcript: importedData })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to import transcript: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    this.transcripts.unshift(data.transcript);
                    
                    this.renderTranscriptList();
                    this.selectTranscript(data.transcript.id);
                    this.showNotification('Transcript imported successfully');
                } catch (error) {
                    console.error('Error importing transcript:', error);
                    this.showNotification('Failed to import transcript: ' + error.message, true);
                }
            };
            
            reader.readAsText(file);
        });
        
        fileInput.click();
    }
    
    async exportSelectedTranscript() {
        if (!this.selectedTranscript) return;
        
        try {
            const transcriptData = JSON.stringify(this.selectedTranscript, null, 2);
            const blob = new Blob([transcriptData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.selectedTranscript.name.replace(/[^\w\s]/gi, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
            
            this.showNotification('Transcript exported');
        } catch (error) {
            console.error('Error exporting transcript:', error);
            this.showNotification('Failed to export transcript', true);
        }
    }
    
    showNotification(message, isError = false) {
        // Use the app's global notification system if available
        if (window.showNotification) {
            window.showNotification(message, isError ? 2000 : 3000);
            return;
        }
        
        // Fallback to local implementation
        const notification = document.createElement('div');
        notification.className = `notification${isError ? ' error' : ''}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show the notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Hide and remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentElement) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // Helper function to safely use the window manager
    withWindowManager(callback) {
        if (window.windowManager) {
            callback(window.windowManager);
        } else if (window._windowManagerQueue) {
            window._windowManagerQueue.push(callback);
        } else {
            console.error('Window manager not available');
        }
    }

    show() {
        this.container.style.display = 'flex';
        this.isVisible = true;
        this.loadTranscripts(); // Refresh list when opened
        this.searchInput.focus();
    }

    hide() {
        if (this.window) {
            this.withWindowManager(windowManager => {
                windowManager.closeWindow(this.window);
                this.window = null;
            });
        } else {
            // For direct DOM manipulation (non-window manager mode)
            if (this.container) {
                this.container.style.display = 'none';
                this.isVisible = false;
            }
        }
    }

    searchInTranscript(query) {
        // Remove search functionality
        return;
    }
    
    toggleMessageForDeletion(messageDiv, index) {
        if (!this.selectedMessagesForDeletion) {
            this.selectedMessagesForDeletion = new Set();
        }
        
        if (this.selectedMessagesForDeletion.has(index)) {
            this.selectedMessagesForDeletion.delete(index);
            messageDiv.classList.remove('selected-for-deletion');
        } else {
            this.selectedMessagesForDeletion.add(index);
            messageDiv.classList.add('selected-for-deletion');
        }
        
        // Show/hide commit button based on selection
        const commitButton = this.contentContainer.querySelector('#commit-deletions');
        if (commitButton) {
            commitButton.style.display = this.selectedMessagesForDeletion.size > 0 ? '' : 'none';
        }
    }
    
    async commitMessageDeletions() {
        if (!this.selectedTranscript || !this.selectedMessagesForDeletion || this.selectedMessagesForDeletion.size === 0) {
            return;
        }
        
        try {
            // Create a new messages array without the deleted messages
            const newMessages = this.selectedTranscript.messages.filter((_, index) => {
                return !this.selectedMessagesForDeletion.has(index);
            });
            
            // Update the transcript in the backend
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${this.selectedTranscript.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    messages: newMessages
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to update transcript: ${response.statusText}`);
            }
            
            // Update the local transcript
            this.selectedTranscript.messages = newMessages;
            
            // Clear selection and refresh the view
            this.selectedMessagesForDeletion.clear();
            this.renderTranscriptContent(this.selectedTranscript);
            
            this.showNotification(`Deleted ${this.selectedMessagesForDeletion.size} messages`);
        } catch (error) {
            console.error('Error deleting messages:', error);
            this.showNotification('Failed to delete messages', true);
        }
    }
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.transcriptManager = new TranscriptManager();
}); 