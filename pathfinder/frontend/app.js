document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.querySelector('.chat-input textarea');
    const sendButton = document.querySelector('#send-button');
    const clearButton = document.querySelector('#clear-chat');
    const chatMessages = document.querySelector('.chat-messages');
    const API_BASE_URL = 'http://127.0.0.1:5000';

    let isProcessing = false;
    let fileTree = [];
    let selectedFiles = new Set();
    let contextMenu = null;
    let searchTimeout = null;
    let pendingAttachments = [];
    let currentFocusedItem = null;
    let lastSelectedItem = null;

    // Theme handling
    const themeToggle = document.getElementById('theme-toggle-input');
    const root = document.documentElement;
    
    // Initialize theme from localStorage or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    root.setAttribute('data-theme', savedTheme);
    themeToggle.checked = savedTheme === 'light';

    // Handle theme toggle
    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // Update highlight.js theme
        const currentLink = document.querySelector('link[href*="highlight.js"]');
        if (currentLink) {
            const newHref = newTheme === 'dark' 
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github-dark.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css';
            currentLink.href = newHref;
        }

        // Re-highlight code blocks if any exist
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });
    });

    // Configure marked options
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    // Initialize textarea height
    function initTextarea() {
        chatInput.style.height = '24px';
        chatInput.style.overflowY = 'hidden';
    }

    // Adjust textarea height
    function adjustTextareaHeight() {
        const maxHeight = 200;
        const minHeight = 24;
        
        // Reset height to minimum to properly calculate scroll height
        chatInput.style.height = `${minHeight}px`;
        
        // Calculate new height
        const scrollHeight = chatInput.scrollHeight;
        const newHeight = Math.min(scrollHeight, maxHeight);
        
        // Set the new height
        chatInput.style.height = `${newHeight}px`;
        
        // If content exceeds max height, enable scrolling
        if (scrollHeight > maxHeight) {
            chatInput.style.overflowY = 'auto';
        } else {
            chatInput.style.overflowY = 'hidden';
        }
    }

    // Add message to chat interface
    function addMessage(text, sender, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}${isError ? ' error' : ''}`;
        
        if (sender === 'assistant' && !isError) {
            // Create a container for the markdown content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'markdown-content';
            contentDiv.innerHTML = marked.parse(text);
            messageDiv.appendChild(contentDiv);

            // Highlight code blocks
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightBlock(block);
            });
        } else {
            messageDiv.textContent = text;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Show loading indicator
    function showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant loading';
        loadingDiv.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return loadingDiv;
    }

    // Remove loading indicator
    function removeLoading(loadingDiv) {
        loadingDiv.remove();
    }

    // Clear chat history
    async function clearChat() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/messages`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to clear chat');
            }
            
            chatMessages.innerHTML = '';
        } catch (error) {
            addMessage('Error clearing chat: ' + error.message, 'error', true);
        }
    }

    // Create file chip element
    function createFileChip(filename, index) {
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.innerHTML = `
            <span class="file-name">${filename}</span>
            <span class="remove-file" data-index="${index}" title="Remove file">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </span>
        `;
        return chip;
    }

    // Update file attachments display
    function updateFileAttachments() {
        const container = document.querySelector('.file-attachments');
        container.innerHTML = '';
        
        pendingAttachments.forEach((attachment, index) => {
            const chip = createFileChip(attachment.filename, index);
            container.appendChild(chip);
        });
    }

    // Remove file attachment
    function removeFileAttachment(index) {
        pendingAttachments.splice(index, 1);
        updateFileAttachments();
    }

    // File upload handling
    function handleFileUpload(file) {
        // Check if file with the same name is already attached
        const isAlreadyAttached = pendingAttachments.some(att => att.filename === file.name);
        if (isAlreadyAttached) {
            console.log(`File ${file.name} is already attached`);
            // Show a brief notification to the user
            const textarea = document.querySelector('.chat-input textarea');
            const originalPlaceholder = textarea.placeholder;
            textarea.placeholder = `File ${file.name} is already attached`;
            setTimeout(() => {
                textarea.placeholder = originalPlaceholder;
            }, 2000);
            return; // Skip upload for duplicate file
        }

        const formData = new FormData();
        formData.append('file', file);

        // Show uploading state in the textarea
        const textarea = document.querySelector('.chat-input textarea');
        const originalPlaceholder = textarea.placeholder;
        textarea.placeholder = `Processing ${file.name}...`;
        textarea.disabled = true;
        chatInput.classList.add('uploading');

        fetch(`${API_BASE_URL}/api/files/upload`, {
            method: 'POST',
            body: formData
        })
        .then(async response => {
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Upload failed');
            }
            return response.json();
        })
        .then(data => {
            // Store the extracted text
            pendingAttachments.push({
                filename: data.filename,
                text: data.extracted_text
            });

            // Update file chips display
            updateFileAttachments();
            
            // Refresh file tree to show new file
            refreshFileTree();
            
            // Focus back on textarea for continued typing
            textarea.focus();
        })
        .catch(error => {
            console.error('Upload failed:', error);
            // Show error in chat
            addMessage(`Error processing file: ${error.message}`, 'assistant', true);
        })
        .finally(() => {
            // Reset textarea state
            textarea.placeholder = originalPlaceholder;
            textarea.disabled = false;
            chatInput.classList.remove('uploading');
        });
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format date
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    // Update preview panel
    async function updatePreview(path) {
        const previewPanel = document.getElementById('preview-panel');
        
        // Show loading state
        previewPanel.innerHTML = `
            <div class="preview-loading">
                <div class="preview-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div>Loading file preview...</div>
            </div>
        `;
        previewPanel.classList.add('loading');
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to get file info');
            
            const fileInfo = await response.json();
            
            let html = `
                <div class="preview-header">${fileInfo.name}</div>
                <div class="meta-item">
                    <span class="meta-label">Type:</span>
                    <span class="meta-value">${fileInfo.type}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Size:</span>
                    <span class="meta-value">${formatFileSize(fileInfo.size)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Modified:</span>
                    <span class="meta-value">${formatDate(fileInfo.modified)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created:</span>
                    <span class="meta-value">${formatDate(fileInfo.created)}</span>
                </div>
            `;

            // Check if it's an image file
            const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileInfo.name);
            
            if (isImage) {
                // For images, create an img element that scales to fit the preview panel
                html += `
                    <div class="preview-header">Preview</div>
                    <div class="preview-content">
                        <img src="user_data/${path}" 
                             alt="${fileInfo.name}"
                             style="max-width: 100%; max-height: 300px; object-fit: contain;">
                    </div>
                `;
            } else if (fileInfo.preview) {
                html += `
                    <div class="preview-header">Preview</div>
                    <div class="preview-content" style="max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                        ${fileInfo.preview}
                    </div>
                `;
            }

            previewPanel.innerHTML = html;
            previewPanel.classList.remove('loading');
        } catch (error) {
            console.error('Error getting file info:', error);
            previewPanel.innerHTML = '<div class="preview-header">Error loading preview</div>';
            previewPanel.classList.remove('loading');
        }
    }

    // Handle file search
    async function handleFileSearch(query) {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        searchTimeout = setTimeout(async () => {
            try {
                console.log('Searching for:', query);
                const response = await fetch(`${API_BASE_URL}/api/files/search?query=${encodeURIComponent(query)}`);
                if (!response.ok) throw new Error('Search failed');
                
                const data = await response.json();
                console.log('Search results:', data);
                
                const treeContainer = document.getElementById('file-tree');
                if (!treeContainer) {
                    console.error('File tree container not found');
                    return;
                }

                treeContainer.innerHTML = '';
                
                if (data.results && data.results.length > 0) {
                    data.results.forEach(item => {
                        const treeItem = createFileTreeItem(item);
                        if (treeItem) {
                            treeContainer.appendChild(treeItem);
                        }
                    });
                } else {
                    treeContainer.innerHTML = '<div class="empty-message">No results found</div>';
                }
            } catch (error) {
                console.error('Search error:', error);
                const treeContainer = document.getElementById('file-tree');
                if (treeContainer) {
                    treeContainer.innerHTML = `<div class="error-message">Error searching files: ${error.message}</div>`;
                }
            }
        }, 100); // Reduced timeout for more responsive search
    }

    // Handle file rename
    async function handleRename(path) {
        const name = prompt('Enter new name:', path.split('/').pop());
        if (!name) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/files/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source: path,
                    destination: path.substring(0, path.lastIndexOf('/') + 1) + name
                })
            });

            if (!response.ok) throw new Error('Failed to rename');
            refreshFileTree();
        } catch (error) {
            console.error('Error renaming:', error);
        }
    }

    // Handle file copy
    async function handleCopy(paths) {
        // Store paths in localStorage for paste operation
        localStorage.setItem('clipboard', JSON.stringify({
            operation: 'copy',
            paths: Array.from(paths)
        }));
    }

    // Handle file paste
    async function handlePaste(targetPath) {
        const clipboard = JSON.parse(localStorage.getItem('clipboard'));
        if (!clipboard) return;

        try {
            for (const path of clipboard.paths) {
                const fileName = path.split('/').pop();
                const destination = targetPath + '/' + fileName;

                const response = await fetch(`${API_BASE_URL}/api/files/copy`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        source: path,
                        destination: destination
                    })
                });

                if (!response.ok) throw new Error(`Failed to copy ${path}`);
            }

            refreshFileTree();
        } catch (error) {
            console.error('Error pasting:', error);
        }
    }

    // Track expanded directories
    const expandedDirectories = new Set();

    // Toggle directory expansion
    function toggleDirectory(item) {
        if (!item || !item.classList.contains('directory')) return;
        
        const toggle = item.querySelector('.toggle');
        if (toggle) {
            toggle.classList.toggle('expanded');
            const children = item.querySelector('.file-tree-children');
            if (children) {
                children.classList.toggle('visible');
            }
            
            // Update expanded state tracking
            const path = item.dataset.path;
            if (toggle.classList.contains('expanded')) {
                expandedDirectories.add(path);
            } else {
                expandedDirectories.delete(path);
            }
        }
    }

    // Create file tree item element
    function createFileTreeItem(item) {
        const div = document.createElement('div');
        div.className = `file-tree-item${item.type === 'directory' ? ' directory' : ''}`;
        div.dataset.path = item.path;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'file-tree-item-content';
        
        const html = `
            ${item.type === 'directory' ? `
                <div class="toggle${expandedDirectories.has(item.path) ? ' expanded' : ''}">
                    <svg viewBox="0 0 24 24">
                        <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
                    </svg>
                </div>
            ` : `
                <div class="toggle" style="visibility: hidden">
                    <svg viewBox="0 0 24 24"></svg>
                </div>
            `}
            <div class="icon">
                ${item.type === 'directory' ? `
                    <svg viewBox="0 0 24 24">
                        <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24">
                        <path fill="currentColor" d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z"/>
                    </svg>
                `}
            </div>
            <span class="name">${item.name}</span>
        `;
        
        contentDiv.innerHTML = html;
        div.appendChild(contentDiv);
        
        if (item.type === 'directory' && item.children) {
            const children = document.createElement('div');
            children.className = `file-tree-children${expandedDirectories.has(item.path) ? ' visible' : ''}`;
            
            item.children.forEach(child => {
                children.appendChild(createFileTreeItem(child));
            });
            
            div.appendChild(children);
        }
        
        return div;
    }

    // Refresh file tree
    async function refreshFileTree() {
        try {
            console.log('Starting file tree refresh...');
            const treeContainer = document.getElementById('file-tree');
            console.log('Tree container found:', treeContainer);
            
            if (!treeContainer) {
                throw new Error('File tree container not found');
            }

            // Show loading state
            treeContainer.innerHTML = '<div class="loading-message">Loading files...</div>';

            console.log('Fetching file tree from API...');
            const response = await fetch(`${API_BASE_URL}/api/files/tree`);
            console.log('API response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch file tree: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Received file tree data:', data);
            
            if (!data.tree || !Array.isArray(data.tree)) {
                throw new Error('Invalid file tree data received');
            }
            
            fileTree = data.tree;
            console.log('File tree array:', fileTree);
            
            treeContainer.innerHTML = '';
            console.log('Tree container cleared');
            
            if (fileTree.length === 0) {
                treeContainer.innerHTML = '<div class="empty-message">No files found</div>';
                console.log('No files found, showing empty message');
            } else {
                console.log('Creating tree items for', fileTree.length, 'items');
                fileTree.forEach(item => {
                    console.log('Creating tree item:', item);
                    const treeItem = createFileTreeItem(item);
                    if (treeItem) {
                        treeContainer.appendChild(treeItem);
                        console.log('Tree item appended:', item.name);
                    }
                });
            }
            
            console.log('File tree refreshed successfully');
        } catch (error) {
            console.error('Error refreshing file tree:', error);
            // Show error in UI
            const treeContainer = document.getElementById('file-tree');
            if (treeContainer) {
                treeContainer.innerHTML = `<div class="error-message">Error loading files: ${error.message}</div>`;
            }
        }
    }

    // File explorer upload handling
    async function handleFileExplorerUpload(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'user_data');

        try {
            const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            // Refresh the file tree to show the new file
            refreshFileTree();
            return true;
        } catch (error) {
            console.error('Error uploading file:', error);
            showNotification(`Failed to upload file: ${file.name}`, 3000);
            return false;
        }
    }

    // Update context menu items
    function createContextMenu(x, y, isDirectory) {
        if (contextMenu) {
            contextMenu.remove();
        }

        contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;

        const items = [
            {
                label: 'Upload File',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z"/></svg>',
                action: () => document.getElementById('file-explorer-upload-input').click()
            },
            {
                label: 'New Folder',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13,19C13,19.34 13.04,19.67 13.09,20H4C2.9,20 2,19.11 2,18V6C2,4.89 2.89,4 4,4H10L12,6H20C21.1,6 22,6.89 22,8V13.81C21.39,13.46 20.72,13.22 20,13.09V8H4V18H13.09C13.04,18.33 13,18.66 13,19M20,18V15H18V18H15V20H18V23H20V20H23V18H20Z"/></svg>',
                action: () => handleNewFolder()
            },
            { type: 'separator' },
            {
                label: 'Copy',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>',
                action: () => handleCopy(selectedFiles)
            },
            {
                label: 'Paste',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,20H5V4H7V7H17V4H19M12,2A1,1 0 0,1 13,3A1,1 0 0,1 12,4A1,1 0 0,1 11,3A1,1 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>',
                action: () => handlePaste(selectedFiles.values().next().value)
            },
            {
                label: 'Rename',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>',
                action: () => handleRename(selectedFiles.values().next().value)
            },
            { type: 'separator' },
            {
                label: 'Delete',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>',
                action: () => handleDelete()
            }
        ];

        items.forEach(item => {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                contextMenu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.innerHTML = `
                    <div class="icon">${item.icon}</div>
                    <span>${item.label}</span>
                `;
                menuItem.addEventListener('click', () => {
                    item.action();
                    contextMenu.remove();
                });
                contextMenu.appendChild(menuItem);
            }
        });

        document.body.appendChild(contextMenu);

        // Close context menu when clicking outside
        const closeContextMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', closeContextMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }

    // Focus an item in the file tree
    function focusFileTreeItem(item) {
        if (!item) return;
        
        // Remove focus from current item
        if (currentFocusedItem) {
            currentFocusedItem.classList.remove('focused');
        }
        
        // Set new focused item
        currentFocusedItem = item;
        currentFocusedItem.classList.add('focused');
        currentFocusedItem.scrollIntoView({ block: 'nearest' });
    }

    // Handle file selection
    function selectFileTreeItem(item, isMultiSelect = false, isRangeSelect = false) {
        if (!item) return;
        
        // If it's a directory, don't select it
        if (item.classList.contains('directory')) return;
        
        if (isRangeSelect) {
            // Range selection with Shift
            const allItems = Array.from(document.querySelectorAll('.file-tree-item:not(.directory)'));
            const startIndex = allItems.indexOf(lastSelectedItem);
            const endIndex = allItems.indexOf(item);
            
            // Clear previous selection if not in multi-select mode
            if (!isMultiSelect) {
                selectedFiles.clear();
                document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
            }
            
            // Select range
            const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
            for (let i = min; i <= max; i++) {
                const path = allItems[i].dataset.path;
                selectedFiles.add(path);
                allItems[i].classList.add('selected');
            }
        } else if (isMultiSelect) {
            // Toggle selection with Ctrl/Cmd
            if (selectedFiles.has(item.dataset.path)) {
                selectedFiles.delete(item.dataset.path);
                item.classList.remove('selected');
            } else {
                selectedFiles.add(item.dataset.path);
                item.classList.add('selected');
            }
        } else {
            // Single selection
            selectedFiles.clear();
            document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            selectedFiles.add(item.dataset.path);
            item.classList.add('selected');
        }
        
        // Update preview with the last selected item
        if (item.dataset.path) {
            updatePreview(item.dataset.path);
        }
        
        // Store the last selected item for range selection
        lastSelectedItem = item;
    }

    // Navigate in the file tree
    function navigateFileTree(direction) {
        if (!currentFocusedItem) return;
        
        const allItems = Array.from(document.querySelectorAll('.file-tree-item:not(.directory)'));
        const visibleItems = allItems.filter(item => {
            // Item is visible if it's not inside a collapsed directory
            const parent = item.parentElement.closest('.file-tree-children');
            if (!parent) return true; // Top-level item
            
            return parent.classList.contains('visible');
        });
        
        const currentIndex = visibleItems.indexOf(currentFocusedItem);
        if (currentIndex === -1) return;
        
        let nextIndex;
        if (direction === 'down') {
            nextIndex = Math.min(currentIndex + 1, visibleItems.length - 1);
        } else {
            nextIndex = Math.max(currentIndex - 1, 0);
        }
        
        focusFileTreeItem(visibleItems[nextIndex]);
    }

    // Handle keyboard navigation
    function handleFileTreeKeydown(e) {
        const treeContainer = document.getElementById('file-tree');
        if (!treeContainer) return;
        
        // If no item is focused yet, focus the first one
        if (!currentFocusedItem) {
            const firstItem = treeContainer.querySelector('.file-tree-item:not(.directory)');
            if (firstItem) {
                focusFileTreeItem(firstItem);
                return;
            }
        }
        
        // Handle different keys
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                e.preventDefault();
                const direction = e.key === 'ArrowDown' ? 'down' : 'up';
                navigateFileTree(direction);
                
                if (e.shiftKey) {
                    // For shift selection, select all items between lastSelectedItem and currentFocusedItem
                    const allItems = Array.from(document.querySelectorAll('.file-tree-item:not(.directory)'));
                    const visibleItems = allItems.filter(item => {
                        const parent = item.parentElement.closest('.file-tree-children');
                        if (!parent) return true;
                        return parent.classList.contains('visible');
                    });
                    
                    const startIndex = visibleItems.indexOf(lastSelectedItem || currentFocusedItem);
                    const endIndex = visibleItems.indexOf(currentFocusedItem);
                    
                    // Clear previous selection
                    selectedFiles.clear();
                    document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                        el.classList.remove('selected');
                    });
                    
                    // Select range
                    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
                    for (let i = min; i <= max; i++) {
                        const path = visibleItems[i].dataset.path;
                        selectedFiles.add(path);
                        visibleItems[i].classList.add('selected');
                    }
                } else if (!e.ctrlKey && !e.metaKey) {
                    // Single selection
                    selectFileTreeItem(currentFocusedItem);
                }
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                // If directory and not expanded, expand it
                if (currentFocusedItem && currentFocusedItem.classList.contains('directory')) {
                    const toggle = currentFocusedItem.querySelector('.toggle');
                    const children = currentFocusedItem.querySelector('.file-tree-children');
                    if (!toggle.classList.contains('expanded')) {
                        toggleDirectory(currentFocusedItem);
                    } else if (children) {
                        // If already expanded, move to first child
                        const firstChild = children.querySelector('.file-tree-item');
                        if (firstChild) {
                            focusFileTreeItem(firstChild);
                            if (!e.ctrlKey && !e.metaKey) {
                                selectFileTreeItem(firstChild);
                            }
                        }
                    }
                }
                break;
                
            case 'ArrowLeft':
                e.preventDefault();
                // If directory and expanded, collapse it
                if (currentFocusedItem && currentFocusedItem.classList.contains('directory')) {
                    const toggle = currentFocusedItem.querySelector('.toggle');
                    if (toggle.classList.contains('expanded')) {
                        toggleDirectory(currentFocusedItem);
                    } else {
                        // If already collapsed, move to parent
                        const parent = findParentItem(currentFocusedItem);
                        if (parent) {
                            focusFileTreeItem(parent);
                            if (!e.ctrlKey && !e.metaKey) {
                                selectFileTreeItem(parent);
                            }
                        }
                    }
                } else {
                    // If file, move to parent
                    const parent = findParentItem(currentFocusedItem);
                    if (parent) {
                        focusFileTreeItem(parent);
                        if (!e.ctrlKey && !e.metaKey) {
                            selectFileTreeItem(parent);
                        }
                    }
                }
                break;
                
            case 'Enter':
                e.preventDefault();
                // For directories: toggle expansion
                if (currentFocusedItem && currentFocusedItem.classList.contains('directory')) {
                    toggleDirectory(currentFocusedItem);
                } else if (currentFocusedItem) {
                    // For files: double-click equivalent behavior
                    selectFileTreeItem(currentFocusedItem, e.ctrlKey || e.metaKey);
                    updatePreview(currentFocusedItem.dataset.path);
                    
                    // Add file to chat input
                    const path = currentFocusedItem.dataset.path;
                    if (path) {
                        // Check if file is already attached
                        const isAlreadyAttached = pendingAttachments.some(att => att.filename === path.split('/').pop());
                        if (!isAlreadyAttached) {
                            // Add file immediately to pending attachments
                            pendingAttachments.push({
                                filename: path.split('/').pop(),
                                text: `[File: ${path.split('/').pop()}]`,
                                type: 'file'
                            });
                            updateFileAttachments();
                            
                            // Then fetch file info in the background
                            fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`)
                                .then(response => {
                                    if (!response.ok) throw new Error('Failed to get file info');
                                    return response.json();
                                })
                                .then(fileInfo => {
                                    // Update the attachment with the actual preview if available
                                    const attachmentIndex = pendingAttachments.findIndex(att => att.filename === fileInfo.name);
                                    if (attachmentIndex !== -1 && fileInfo.preview) {
                                        pendingAttachments[attachmentIndex].text = fileInfo.preview;
                                        updateFileAttachments();
                                    }
                                })
                                .catch(error => {
                                    console.error('Error getting file content:', error);
                                });
                        }
                    }
                }
                break;
                
            case 'a':
                // Select all files (Ctrl+A)
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const allFiles = document.querySelectorAll('.file-tree-item:not(.directory)');
                    selectedFiles.clear();
                    allFiles.forEach(file => {
                        selectedFiles.add(file.dataset.path);
                        file.classList.add('selected');
                    });
                }
                break;
        }
    }

    // Find the parent item of a given item
    function findParentItem(item) {
        if (!item) return null;
        
        // Traverse up to find the parent file-tree-children
        const parentChildren = item.closest('.file-tree-children');
        if (!parentChildren) return null;
        
        // Then get the parent file-tree-item
        return parentChildren.closest('.file-tree-item');
    }

    // Update file tree click handler
    function handleFileTreeClick(e) {
        const item = e.target.closest('.file-tree-item');
        if (!item) return;

        // Focus the clicked item
        focusFileTreeItem(item);

        const toggle = e.target.closest('.toggle');
        if (toggle && item.classList.contains('directory')) {
            toggleDirectory(item);
            return;
        }

        // Handle file selection
        if (!item.classList.contains('directory')) {
            selectFileTreeItem(
                item,
                e.ctrlKey || e.metaKey, // Multi-select
                e.shiftKey // Range select
            );

            // If double clicking or Enter key, add file to chat input
            if (e.detail === 2 || e.key === 'Enter') {
                const path = item.dataset.path;
                if (path) {
                    // Check if file is already attached
                    const isAlreadyAttached = pendingAttachments.some(att => att.filename === path.split('/').pop());
                    if (!isAlreadyAttached) {
                        // Add file immediately to pending attachments
                        pendingAttachments.push({
                            filename: path.split('/').pop(),
                            text: `[File: ${path.split('/').pop()}]`,
                            type: 'file'
                        });
                        updateFileAttachments();
                        
                        // Then fetch file info in the background
                        fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`)
                            .then(response => {
                                if (!response.ok) throw new Error('Failed to get file info');
                                return response.json();
                            })
                            .then(fileInfo => {
                                // Update the attachment with the actual preview if available
                                const attachmentIndex = pendingAttachments.findIndex(att => att.filename === fileInfo.name);
                                if (attachmentIndex !== -1 && fileInfo.preview) {
                                    pendingAttachments[attachmentIndex].text = fileInfo.preview;
                                    updateFileAttachments();
                                }
                            })
                            .catch(error => {
                                console.error('Error getting file content:', error);
                            });
                    }
                }
            }
        }
    }

    // Handle right click on file tree
    function handleFileTreeContextMenu(e) {
        e.preventDefault();
        const item = e.target.closest('.file-tree-item');
        if (!item) return;

        // If right-clicking an unselected item, select it
        if (!item.classList.contains('selected')) {
            document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            selectedFiles.clear();
            selectedFiles.add(item.dataset.path);
            item.classList.add('selected');
        }

        createContextMenu(e.pageX, e.pageY, item.classList.contains('directory'));
    }

    // Handle file operations
    async function handleNewFile() {
        const name = prompt('Enter file name:');
        if (!name) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: name,
                    type: 'file'
                })
            });

            if (!response.ok) throw new Error('Failed to create file');
            refreshFileTree();
        } catch (error) {
            console.error('Error creating file:', error);
        }
    }

    async function handleNewFolder() {
        const name = prompt('Enter folder name:');
        if (!name) return;

        try {
            // Get the current directory path from the selected item or context menu
            let targetPath = 'user_data';
            const selectedItem = document.querySelector('.file-tree-item.selected');
            if (selectedItem && selectedItem.classList.contains('directory')) {
                targetPath = selectedItem.dataset.path;
            }

            const response = await fetch(`${API_BASE_URL}/api/files/create_directory`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: targetPath + '/' + name
                })
            });

            if (!response.ok) throw new Error('Failed to create folder');
            refreshFileTree();
        } catch (error) {
            console.error('Error creating folder:', error);
            showNotification(`Failed to create folder: ${error.message}`, 3000);
        }
    }

    async function handleDelete() {
        if (selectedFiles.size === 0) return;

        const confirmMessage = selectedFiles.size === 1 
            ? 'Are you sure you want to delete this item?' 
            : `Are you sure you want to delete these ${selectedFiles.size} items?`;

        if (!confirm(confirmMessage)) return;

        try {
            for (const path of selectedFiles) {
                // Find the corresponding DOM element to check if it's a directory
                const item = document.querySelector(`.file-tree-item[data-path="${path}"]`);
                const isDirectory = item && item.classList.contains('directory');

                const response = await fetch(`${API_BASE_URL}/api/files/delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        path: path,
                        is_directory: isDirectory
                    })
                });

                if (!response.ok) {
                    let errorMessage = 'Failed to delete item';
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        // If response is not JSON, try to get text
                        const text = await response.text();
                        errorMessage = text || errorMessage;
                    }
                    throw new Error(errorMessage);
                }
            }

            selectedFiles.clear();
            refreshFileTree();
        } catch (error) {
            console.error('Error deleting items:', error);
            showNotification(`Error deleting item: ${error.message}`, 3000);
        }
    }

    // Update sendMessage to include selected files
    async function sendMessage() {
        const message = chatInput.value.trim();
        if ((!message && !pendingAttachments.length && selectedFiles.size === 0) || isProcessing) return;

        isProcessing = true;
        sendButton.disabled = true;
        
        // Add user message to chat
        addMessage(message, 'user');
        
        // Clear input and reset height
        chatInput.value = '';
        initTextarea();
        
        // Show loading indicator
        const loadingDiv = showLoading();
        
        try {
            // Get text content from selected files
            const selectedFileContents = [];
            for (const path of selectedFiles) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`);
                    if (!response.ok) throw new Error(`Failed to get file info for ${path}`);
                    const fileInfo = await response.json();
                    
                    if (fileInfo.preview) {
                        selectedFileContents.push({
                            filename: fileInfo.name,
                            text: fileInfo.preview
                        });
                    }
                } catch (error) {
                    console.error(`Error getting file content: ${error}`);
                }
            }
            
            // Combine selected files with pending attachments
            const allAttachments = [
                ...pendingAttachments,
                ...selectedFileContents
            ];
            
            const response = await fetch(`${API_BASE_URL}/api/interact`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    attachments: allAttachments.map(att => att.text),
                    stream: true,
                    tools: true,
                    markdown: true
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response from AI');
            }

            // Clear pending attachments and update display
            pendingAttachments = [];
            updateFileAttachments();

            // Remove loading indicator
            removeLoading(loadingDiv);

            // Create assistant message container
            const assistantMessage = document.createElement('div');
            assistantMessage.className = 'message assistant';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'markdown-content';
            assistantMessage.appendChild(contentDiv);
            chatMessages.appendChild(assistantMessage);

            // Stream the response
            const reader = response.body.getReader();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Convert the chunk to text
                const chunk = new TextDecoder().decode(value);
                accumulatedText += chunk;
                
                // Update the message with the accumulated text
                contentDiv.innerHTML = marked.parse(accumulatedText);
                
                // Highlight code blocks
                assistantMessage.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightBlock(block);
                });
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            // Refresh file tree after interaction is complete
            refreshFileTree();
        } catch (error) {
            removeLoading(loadingDiv);
            addMessage('Error: ' + error.message, 'error', true);
        } finally {
            isProcessing = false;
            sendButton.disabled = false;
            chatInput.focus();
        }
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    clearButton.addEventListener('click', clearChat);
    
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', adjustTextareaHeight);

    // Add resize handles to panes
    function initResizableColumns() {
        const panes = document.querySelectorAll('.pane');
        
        panes.forEach((pane, index) => {
            // Don't add handle to the last pane
            if (index < panes.length - 1) {
                const handle = document.createElement('div');
                handle.className = 'pane-resize-handle';
                pane.appendChild(handle);

                let isResizing = false;
                let startX;
                let startWidth;
                let nextStartWidth;

                handle.addEventListener('mousedown', (e) => {
                    isResizing = true;
                    handle.classList.add('active');
                    startX = e.pageX;
                    startWidth = pane.offsetWidth;
                    if (pane.nextElementSibling) {
                        nextStartWidth = pane.nextElementSibling.offsetWidth;
                    }
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;

                    const diff = e.pageX - startX;
                    
                    // Calculate new widths
                    const newWidth = startWidth + diff;
                    const newNextWidth = nextStartWidth - diff;

                    // Check minimum widths
                    const minWidth = parseInt(window.getComputedStyle(pane).minWidth);
                    const nextMinWidth = pane.nextElementSibling ? 
                        parseInt(window.getComputedStyle(pane.nextElementSibling).minWidth) : 0;

                    // Only apply if both panes stay above their minimum widths
                    if (newWidth >= minWidth && newNextWidth >= nextMinWidth) {
                        pane.style.width = `${newWidth}px`;
                        if (pane.nextElementSibling) {
                            pane.nextElementSibling.style.width = `${newNextWidth}px`;
                        }
                    }
                });

                document.addEventListener('mouseup', () => {
                    isResizing = false;
                    handle.classList.remove('active');
                });
            }
        });
    }

    // Initialize preview resize handle
    function initPreviewResize() {
        const resizeHandle = document.querySelector('.preview-resize-handle');
        const previewPanel = document.getElementById('preview-panel');
        const fileTreeContainer = document.querySelector('.file-tree-container');
        let isResizing = false;
        let startY;
        let startHeight;
        let startTreeHeight;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = previewPanel.offsetHeight;
            startTreeHeight = fileTreeContainer.offsetHeight;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaY = startY - e.clientY;
            const newHeight = startHeight + deltaY;
            const minHeight = 100;
            const maxHeight = window.innerHeight - 200;
            const containerHeight = fileTreeContainer.parentElement.offsetHeight;

            if (newHeight >= minHeight && newHeight <= maxHeight) {
                previewPanel.style.height = `${newHeight}px`;
                fileTreeContainer.style.height = `${containerHeight - newHeight - 4}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            document.body.style.cursor = '';
        });
    }

    // Show notification message
    function showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }

    // Initialize drag and drop
    function initializeFileUpload() {
        const textarea = document.querySelector('.chat-input textarea');
        const chatInput = document.querySelector('.chat-input');
        const attachmentButton = document.querySelector('.attachment-button');
        const fileAttachments = document.querySelector('.file-attachments');
        
        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'file-upload-input';
        fileInput.style.display = 'none';
        fileInput.multiple = false;
        document.body.appendChild(fileInput);

        // Handle file chip removal
        fileAttachments.addEventListener('click', (e) => {
            const removeButton = e.target.closest('.remove-file');
            if (removeButton) {
                const index = parseInt(removeButton.dataset.index);
                if (!isNaN(index)) {
                    removeFileAttachment(index);
                }
            }
        });

        // Handle drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            textarea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            
            chatInput.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Add visual feedback for drag events
        ['dragenter', 'dragover'].forEach(eventName => {
            chatInput.addEventListener(eventName, () => {
                chatInput.classList.add('drag-active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            chatInput.addEventListener(eventName, () => {
                chatInput.classList.remove('drag-active');
            });
        });

        // Handle drop
        chatInput.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) {
                handleFileUpload(file);
            }
        });

        // Handle attachment button click
        attachmentButton.addEventListener('click', () => {
            fileInput.click();
        });

        // Handle file selection
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                // Show uploading state
                chatInput.classList.add('uploading');
                
                let successCount = 0;
                let failCount = 0;
                
                for (const file of files) {
                    try {
                        handleFileUpload(file);
                        successCount++;
                    } catch (error) {
                        console.error('Error uploading file:', error);
                        showError(`Failed to upload file: ${file.name}`);
                        failCount++;
                    }
                }
                
                // Remove uploading state after a delay
                setTimeout(() => {
                    chatInput.classList.remove('uploading');
                }, 1000);
            }
            // Reset the file input
            fileInput.value = '';
        });
    }

    // Handle drag and drop
    function handleDragStart(e) {
        const item = e.target.closest('.file-tree-item');
        if (!item) return;
        
        // If the dragged item is not selected, clear other selections
        if (!item.classList.contains('selected')) {
            selectedFiles.clear();
            document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            selectFileTreeItem(item);
        }
        
        // Create a drag image that shows all selected items
        const dragItems = document.querySelectorAll('.file-tree-item.selected');
        if (dragItems.length > 0) {
            const dragImage = document.createElement('div');
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-9999px';
            dragImage.style.left = '-9999px';
            dragImage.style.padding = '8px';
            dragImage.style.background = 'var(--bg-secondary)';
            dragImage.style.border = '1px solid var(--border-color)';
            dragImage.style.borderRadius = '4px';
            dragImage.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
            
            dragItems.forEach(item => {
                const clone = item.cloneNode(true);
                clone.style.width = '200px';
                clone.style.marginBottom = '4px';
                dragImage.appendChild(clone);
            });
            
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 0, 0);
            
            // Remove the drag image after a short delay
            setTimeout(() => document.body.removeChild(dragImage), 0);
        }
        
        // Add dragging class to all selected items
        document.querySelectorAll('.file-tree-item.selected').forEach(el => {
            el.classList.add('dragging');
        });
        
        // Store the selected paths in the dataTransfer
        const selectedPaths = Array.from(selectedFiles);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/json', JSON.stringify(selectedPaths));
    }

    function handleDragOver(e) {
        e.preventDefault();
        const target = e.target.closest('.file-tree-item, #file-tree');
        if (!target) return;
        
        // Remove drag-over from all items
        document.querySelectorAll('.file-tree-item.drag-over, #file-tree.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        // Add drag-over class to target
        target.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDragLeave(e) {
        const target = e.target.closest('.file-tree-item, #file-tree');
        if (!target) return;
        target.classList.remove('drag-over');
    }

    async function handleDrop(e) {
        e.preventDefault();
        
        // Get the target directory
        const targetItem = e.target.closest('.file-tree-item');
        if (!targetItem) return;
        
        // If target is not a directory, use its parent directory
        let targetPath = targetItem.dataset.path;
        if (!targetItem.classList.contains('directory')) {
            const parentItem = findParentItem(targetItem);
            if (!parentItem) return;
            targetPath = parentItem.dataset.path;
        }
        
        // Get all selected items to move
        const selectedItems = document.querySelectorAll('.file-tree-item.selected');
        const pathsToMove = Array.from(selectedItems).map(item => item.dataset.path);
        if (pathsToMove.length === 0) return;
        
        try {
            // Move each selected item
            for (const path of pathsToMove) {
                // Check if we're trying to move a directory into itself or its subdirectories
                if (path === targetPath || targetPath.startsWith(path + '/')) {
                    showNotification('Cannot move a directory into itself or its subdirectories', 3000);
                    continue;
                }

                // Construct the destination path
                const itemName = path.split('/').pop();
                const destination = targetPath + '/' + itemName;

                const response = await fetch(`${API_BASE_URL}/api/files/move`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        source: path,
                        destination: destination,
                        is_directory: selectedItems[0].classList.contains('directory')
                    })
                });
                
                if (!response.ok) {
                    let errorMessage = 'Failed to move item';
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        // If response is not JSON, try to get text
                        const text = await response.text();
                        errorMessage = text || errorMessage;
                    }
                    throw new Error(errorMessage);
                }
            }
            
            // Refresh the file tree to show the changes
            await refreshFileTree();
            
            // Clean up drag state
            const fileTree = document.querySelector('.file-tree');
            if (fileTree) {
                fileTree.classList.remove('drag-over');
            }
            document.querySelectorAll('.file-tree-item.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
            
        } catch (error) {
            console.error('Error moving items:', error);
            showNotification(`Error moving item: ${error.message}`, 3000);
            
            // Clean up drag state even on error
            const fileTree = document.querySelector('.file-tree');
            if (fileTree) {
                fileTree.classList.remove('drag-over');
            }
            document.querySelectorAll('.file-tree-item.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
        }
    }

    // Initialize all features
    function initializeFeatures() {
        // Wait for all DOM elements to be ready
        const checkElements = setInterval(() => {
            const treeContainer = document.getElementById('file-tree');
            const previewPanel = document.getElementById('preview-panel');
            const chatInput = document.querySelector('.chat-input textarea');
            const newFileButton = document.getElementById('new-file');
            const newFolderButton = document.getElementById('new-folder');
            const refreshButton = document.getElementById('refresh-files');
            const searchInput = document.getElementById('file-search');
            
            if (treeContainer && previewPanel && chatInput) {
                clearInterval(checkElements);
                
                // Initialize features
                initTextarea();
                initializeFileUpload();
                initPreviewResize();
                initResizableColumns();
                
                // Add click outside handler for file explorer
                document.addEventListener('click', (e) => {
                    const fileExplorer = document.querySelector('.file-explorer');
                    if (fileExplorer && !fileExplorer.contains(e.target)) {
                        // Clear selections
                        selectedFiles.clear();
                        document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                            el.classList.remove('selected');
                        });
                    }
                });
                
                // Initialize event listeners
                if (treeContainer) {
                    treeContainer.addEventListener('click', handleFileTreeClick);
                    treeContainer.addEventListener('contextmenu', handleFileTreeContextMenu);
                    
                    // Add keyboard navigation
                    document.addEventListener('keydown', handleFileTreeKeydown);
                    
                    // Add drag and drop functionality
                    treeContainer.addEventListener('dragstart', handleDragStart);
                    treeContainer.addEventListener('dragend', (e) => {
                        const item = e.target.closest('.file-tree-item');
                        if (item) {
                            item.classList.remove('dragging');
                        }
                    });
                    treeContainer.addEventListener('dragover', handleDragOver);
                    treeContainer.addEventListener('dragleave', handleDragLeave);
                    treeContainer.addEventListener('drop', handleDrop);

                    // Make items draggable
                    treeContainer.addEventListener('mousedown', (e) => {
                        const item = e.target.closest('.file-tree-item');
                        if (item) {
                            item.draggable = true;
                        }
                    });
                }

                // Update the upload file button functionality
                const uploadFileButton = document.getElementById('upload-file');
                if (uploadFileButton) {
                    // Create hidden file input for file explorer uploads
                    const fileExplorerInput = document.createElement('input');
                    fileExplorerInput.type = 'file';
                    fileExplorerInput.multiple = true;
                    fileExplorerInput.style.display = 'none';
                    fileExplorerInput.id = 'file-explorer-upload-input';
                    document.body.appendChild(fileExplorerInput);

                    // Handle file upload button click
                    uploadFileButton.addEventListener('click', () => {
                        fileExplorerInput.click();
                    });

                    // Handle file selection for file explorer
                    fileExplorerInput.addEventListener('change', async (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length > 0) {
                            // Show uploading state
                            uploadFileButton.classList.add('uploading');
                            
                            let successCount = 0;
                            let failCount = 0;
                            
                            for (const file of files) {
                                const success = await handleFileExplorerUpload(file);
                                if (success) {
                                    successCount++;
                                } else {
                                    failCount++;
                                }
                            }
                            
                            // Remove uploading state
                            uploadFileButton.classList.remove('uploading');
                            
                            // Show status message
                            if (successCount > 0 && failCount === 0) {
                                showNotification(`${successCount} file${successCount !== 1 ? 's' : ''} uploaded successfully`);
                            } else if (successCount > 0 && failCount > 0) {
                                showNotification(`${successCount} file${successCount !== 1 ? 's' : ''} uploaded, ${failCount} failed`);
                            }
                        }
                        // Reset the file input
                        fileExplorerInput.value = '';
                    });
                }

                if (newFolderButton) {
                    newFolderButton.addEventListener('click', handleNewFolder);
                }

                if (refreshButton) {
                    refreshButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        refreshFileTree();
                    });
                }

                if (searchInput) {
                    // Add clear button
                    const clearButton = document.createElement('div');
                    clearButton.className = 'search-clear-button';
                    clearButton.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                        </svg>
                    `;
                    searchInput.parentNode.appendChild(clearButton);

                    // Handle search input
                    searchInput.addEventListener('input', (e) => {
                        const query = e.target.value.trim();
                        if (query) {
                            handleFileSearch(query);
                            clearButton.style.display = 'block';
                        } else {
                            refreshFileTree();
                            clearButton.style.display = 'none';
                        }
                    });

                    // Handle clear button click
                    clearButton.addEventListener('click', () => {
                        searchInput.value = '';
                        searchInput.placeholder = 'Search files...';
                        clearButton.style.display = 'none';
                        refreshFileTree();
                    });

                    // Show/hide clear button based on input
                    searchInput.addEventListener('focus', () => {
                        if (searchInput.value) {
                            clearButton.style.display = 'block';
                        }
                    });

                    searchInput.addEventListener('blur', () => {
                        if (!searchInput.value) {
                            clearButton.style.display = 'none';
                        }
                    });
                }
                
                // Initial file tree load with retry mechanism
                let retryCount = 0;
                const maxRetries = 3;
                
                function loadFileTree() {
                    refreshFileTree().catch(error => {
                        console.error('Error loading file tree:', error);
                        if (retryCount < maxRetries) {
                            retryCount++;
                            console.log(`Retrying file tree load (attempt ${retryCount})...`);
                            setTimeout(loadFileTree, 1000 * retryCount);
                        }
                    });
                }
                
                loadFileTree();
            }
        }, 100);
    }

    // Start initialization when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFeatures);
    } else {
        initializeFeatures();
    }
}); 