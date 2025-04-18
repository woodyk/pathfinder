//
// File: app.js
// Author: Wadih Khairallah
// Description: 
// Created: 2025-04-12 01:34:02
// API Base URL
const API_BASE_URL = 'http://127.0.0.1:5000';

// Add this code in an appropriate place, possibly near the document.addEventListener('DOMContentLoaded') section:

// Chat Interface for managing chat messages
class ChatInterface {
    constructor() {
        this.messagesContainer = document.querySelector('.chat-messages');
        this.chatInput = document.querySelector('.chat-input textarea');
        this.sendButton = document.querySelector('#send-button');
        this.chatArea = document.querySelector('.ai-chat');
        this.messages = [];
        this.currentTranscriptId = null;
        this.currentTranscriptName = "Untitled";
        this.useLocalStorage = false;
        this.hasActivity = false; // Track if there's been any chat activity
        this.hasBeenRenamed = false; // Track if the session has been renamed
        this.isWaitingForResponse = false; // Add flag to track response state
        
        // Add transcript name display in header
        const chatHeader = document.querySelector('.ai-chat .pane-header h2');
        this.transcriptNameContainer = document.createElement('div');
        this.transcriptNameContainer.className = 'transcript-name-container';
        this.transcriptNameDisplay = document.createElement('span');
        this.transcriptNameDisplay.className = 'transcript-name editable';
        this.transcriptNameDisplay.textContent = this.currentTranscriptName;
        this.transcriptNameDisplay.title = "Click to rename transcript";
        this.transcriptNameContainer.appendChild(this.transcriptNameDisplay);
        chatHeader.parentNode.insertBefore(this.transcriptNameContainer, chatHeader.nextSibling);
        
        // Add new session button
        const chatControls = document.querySelector('.chat-controls');
        this.newSessionBtn = document.createElement('button');
        this.newSessionBtn.id = 'new-session';
        this.newSessionBtn.className = 'icon-button';
        this.newSessionBtn.title = 'New Conversation';
        this.newSessionBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
            </svg>
        `;
        chatControls.insertBefore(this.newSessionBtn, chatControls.firstChild);
        
        this.bindEvents();
        
        // Set the API base URL
        this.API_BASE_URL = 'http://127.0.0.1:5000';  // Base URL for API calls
        
        // Add message saving functionality
        this.saveMessageToTranscript = async (role, content, timestamp = null) => {
            if (!this.currentTranscriptId) return;
            
            try {
                // Get existing transcript
                const response = await fetch(`${API_BASE_URL}/api/transcripts/${this.currentTranscriptId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get transcript');
                }
                
                const data = await response.json();
                const transcript = data.transcript;
                
                // Add the new message to the transcript's messages array
                transcript.messages.push({
                    role: role,
                    content: content,
                    timestamp: timestamp || Date.now()
                });
                
                // Update the transcript
                const updateResponse = await fetch(`${API_BASE_URL}/api/transcripts/${this.currentTranscriptId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(transcript)
                });
                
                if (!updateResponse.ok) {
                    throw new Error('Failed to update transcript');
                }
                
                // Save current session state to localStorage
                this.saveSessionState();
                
            } catch (error) {
                console.error('Error saving message to transcript:', error);
                // Fallback to localStorage
                this.saveTranscriptToLocalStorage();
            }
        };
        
        // Add localStorage fallback
        this.saveTranscriptToLocalStorage = () => {
            try {
                // Get existing transcripts
                const localTranscripts = JSON.parse(localStorage.getItem('transcripts') || '[]');
                
                // Find if this transcript exists
                const existingIndex = localTranscripts.findIndex(t => t.id === this.currentTranscriptId);
                
                const updatedTranscript = {
                    id: this.currentTranscriptId,
                    name: this.currentTranscriptName,
                    messages: this.messages,
                    lastModified: new Date().toISOString(),
                    date: new Date().toISOString()
                };
                
                // Update or add transcript
                if (existingIndex >= 0) {
                    localTranscripts[existingIndex] = updatedTranscript;
                } else {
                    localTranscripts.unshift(updatedTranscript);
                }
                
                // Save back to localStorage
                localStorage.setItem('transcripts', JSON.stringify(localTranscripts));
                
                // Save current session state
                this.saveSessionState();
            } catch (error) {
                console.error('Error saving to localStorage:', error);
            }
        };
        
        // Save current session state to localStorage
        this.saveSessionState = () => {
            if (this.currentTranscriptId) {
                localStorage.setItem('currentSession', JSON.stringify({
                    transcriptId: this.currentTranscriptId,
                    name: this.currentTranscriptName,
                    timestamp: Date.now()
                }));
            }
        };
        
        // Try to restore previous session
        this.restoreSession();
        
        // Add these helper functions to the class
        this.showLoading = () => {
            const messagesContainer = document.querySelector('.chat-messages');
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-message';
            loadingDiv.innerHTML = `
                <div class="loading-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
                <div class="loading-text">Thinking...</div>
            `;
            messagesContainer.appendChild(loadingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return loadingDiv;
        };
        
        this.removeLoading = (loadingDiv) => {
            if (loadingDiv && loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
            }
        };

        // Add scroll-to-bottom button
        this.scrollToBottomButton = document.createElement('button');
        this.scrollToBottomButton.className = 'scroll-to-bottom';
        this.scrollToBottomButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>
            </svg>
        `;
        // Append to chat area instead of document.body for proper positioning
        this.chatArea = document.querySelector('.ai-chat');
        this.chatArea.appendChild(this.scrollToBottomButton);
        
        // Initialize scroll handling
        this.initScrollHandling();
    }
    
    initScrollHandling() {
        let scrollTimeout;
        let lastScrollTop = 0;
        let isScrolling = false;

        // Handle scroll events
        this.messagesContainer.addEventListener('scroll', () => {
            // Show scrollbar
            this.messagesContainer.style.setProperty('--scrollbar-opacity', '1');
            
            // Clear previous timeout
            clearTimeout(scrollTimeout);
            
            // Set new timeout to hide scrollbar
            scrollTimeout = setTimeout(() => {
                this.messagesContainer.style.setProperty('--scrollbar-opacity', '0');
            }, 10000); // 10 second timeout
            
            // Check if we're near the bottom
            const isNearBottom = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop <= this.messagesContainer.clientHeight + 100;
            
            // Show/hide scroll-to-bottom button
            this.scrollToBottomButton.classList.toggle('visible', !isNearBottom);
            
            // Update last scroll position
            lastScrollTop = this.messagesContainer.scrollTop;
        });

        // Handle scroll-to-bottom button click
        this.scrollToBottomButton.addEventListener('click', () => {
            this.smoothScrollToBottom();
        });

        // Listen for resize events on the pane resize handles
        const resizeObserver = new ResizeObserver(() => {
            // Update the button position when the chat pane is resized
            this.updateScrollButtonPosition();
        });
        
        // Observe the chat area for size changes
        resizeObserver.observe(this.chatArea);
    }
    
    // Add new method to update scroll button position
    updateScrollButtonPosition() {
        // Nothing to do here - the CSS will handle the positioning
        // This method exists in case we need to add more complex repositioning logic in the future
    }

    smoothScrollToBottom() {
        const start = this.messagesContainer.scrollTop;
        const end = this.messagesContainer.scrollHeight - this.messagesContainer.clientHeight;
        const duration = 300; // ms
        const startTime = performance.now();

        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease in-out function
            const ease = (t) => t<.5 ? 2*t*t : -1+(4-2*t)*t;
            
            this.messagesContainer.scrollTop = start + (end - start) * ease(progress);
            
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        };

        requestAnimationFrame(animateScroll);
    }
    
    bindEvents() {
        // Clear chat button
        
        // Bind send button
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                if (!this.isWaitingForResponse) {
                    this.handleSendMessage();
                }
            });
        }
        
        // Bind Enter key in textarea (Shift+Enter for new line)
        const textarea = document.querySelector('.chat-input textarea');
        if (textarea) {
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    if (!this.isWaitingForResponse) {
                        e.preventDefault();
                        this.handleSendMessage();
                    } else {
                        e.preventDefault();
                    }
                }
            });
            
            // Auto-resize textarea as user types
            textarea.addEventListener('input', () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            });
        }
        
        // Manage transcripts button
        const manageButton = document.getElementById('manage-transcripts');
        if (manageButton) {
            manageButton.addEventListener('click', () => {
                if (window.transcriptManager) {
                    window.transcriptManager.openManager();
                }
            });
        }
        
        // Inline editing for transcript name
        if (this.transcriptNameDisplay) {
            this.transcriptNameDisplay.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Create an input element to replace the span
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'transcript-name-edit';
                input.value = this.currentTranscriptName;
                input.style.width = (this.currentTranscriptName.length * 8) + 'px'; // Estimate width
                input.style.minWidth = '100px';
                
                // Replace the span with the input
                this.transcriptNameContainer.replaceChild(input, this.transcriptNameDisplay);
                
                // Focus and select all text
                input.focus();
                input.select();
                
                // Handle Enter key
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        // Cancel editing
                        this.transcriptNameContainer.replaceChild(this.transcriptNameDisplay, input);
                    }
                });
                
                // Handle blur event (when focus is lost)
                input.addEventListener('blur', () => {
                    const newName = input.value.trim();
                    
                    // Replace the input with the span
                    this.transcriptNameContainer.replaceChild(this.transcriptNameDisplay, input);
                    
                    // Update the name if changed
                    if (newName && newName !== this.currentTranscriptName) {
                        this.currentTranscriptName = newName;
                        this.transcriptNameDisplay.textContent = newName;
                        this.hasBeenRenamed = true;
                        
                        if (this.currentTranscriptId) {
                            this.updateTranscriptName(this.currentTranscriptId, newName);
                        } else if (this.hasActivity) {
                            // Create a new transcript if there's activity but no ID yet
                            this.createNewTranscript();
                        }
                        
                        // Notify transcript manager to refresh
                        if (window.transcriptManager) {
                            window.transcriptManager.loadTranscripts();
                        }
                    }
                });
            });
        }
        
        // New session button
        if (this.newSessionBtn) {
            this.newSessionBtn.addEventListener('click', () => this.startNewSession());
        }
    }

    async handleSendMessage() {
        // Don't allow sending if we're already waiting for a response
        if (this.isWaitingForResponse) return;

        const textarea = document.querySelector('.chat-input textarea');
        const userInput = textarea.value.trim();
        if (!userInput) return;

        // Set waiting flag and disable only the send button
        this.isWaitingForResponse = true;
        document.getElementById('send-button').disabled = true;

        // Clear input
        textarea.value = '';
        textarea.style.height = '24px';

        // If this is the first message and we don't have a transcript ID, create one
        if (!this.currentTranscriptId && this.hasActivity === false) {
            // Create a new transcript silently 
            await this.createNewTranscript();
        }

        // Add user message
        this.addMessage('user', userInput);

        // Create assistant message container
        const assistantMessage = document.createElement('div');
        assistantMessage.className = 'chat-message assistant';
        assistantMessage.dataset.timestamp = Date.now();
        
        // Create avatar for assistant
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,8.39C13.57,9.4 15.42,10 17.42,10C18.2,10 18.95,9.91 19.67,9.74C19.88,10.45 20,11.21 20,12C20,16.41 16.41,20 12,20C9,20 6.39,18.34 5,15.89L6.75,14V13A1.25,1.25 0 0,1 8,11.75A1.25,1.25 0 0,1 9.25,13V14H12M14.5,10.5C13.74,10.5 13.12,10.73 12.5,10.73C11.88,10.73 11.26,10.5 10.5,10.5C9.47,10.5 8.5,11.54 8.5,12.57C8.5,13.38 9.11,14 9.92,14H10.08C10.89,14 11.5,13.38 11.5,12.57C11.5,12.05 12.05,11.5 12.57,11.5C13.38,11.5 14,10.89 14,10.08V9.92C14,9.11 13.38,8.5 12.57,8.5C11.5,8.5 10.5,9.3 10.5,10.5"></path></svg>`;
    assistantMessage.appendChild(avatar);
    
    // Create wrapper for content
    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'message-content-wrapper';
    
    // Create loading indicator with "Thinking..." text
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-content';
    loadingDiv.innerHTML = `
        <div class="loading-text">Thinking</div>
        <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    wrapperDiv.appendChild(loadingDiv);
    
    // Add timestamp to the wrapper
    const messageTimestamp = document.createElement('div');
    messageTimestamp.className = 'message-timestamp';
    const msgDate = new Date();
    const formattedDate = msgDate.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    messageTimestamp.textContent = formattedDate;
    wrapperDiv.appendChild(messageTimestamp);
    
    assistantMessage.appendChild(wrapperDiv);
    
        // Add message to the UI
        this.messagesContainer.appendChild(assistantMessage);
        
        // Ensure the loading message is visible by scrolling to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        
        // Prepare content div for streaming
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        const mainContentDiv = document.createElement('div');
        contentDiv.appendChild(mainContentDiv);
        
        let startTime = Date.now();
        let accumulatedText = '';
        let toolCallInProgress = false;
        let currentToolName = '';
        let hasStartedStreaming = false;
        let shouldSaveToTranscript = true;
        
        try {
            // Prepare fetch request to the API
            const apiEndpoint = `${this.API_BASE_URL}/api/interact`;
            
            // Extract text from attachments
            const allAttachments = window.pendingAttachments || [];
            const attachmentTexts = allAttachments.map(a => a.text);
            
            // Prepare request body
            const requestBody = {
                message: userInput,
                attachments: attachmentTexts,
                stream: true,
                tools: true
            };
            
            // Add transcript ID if we have one
            if (this.currentTranscriptId) {
                requestBody.transcript_id = this.currentTranscriptId;
            }
            
            // Clear file attachments after sending
            window.pendingAttachments = [];
            updateFileAttachments();
            
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    // Remove loading indicator if still present
                    if (wrapperDiv.contains(loadingDiv)) {
                        wrapperDiv.removeChild(loadingDiv);
                    }
                    
                    // Add the final content div if not already added
                    if (!wrapperDiv.contains(contentDiv)) {
                        wrapperDiv.appendChild(contentDiv);
                    }
                    
                    // Make sure timestamp is visible
                    const existingTimestamp = wrapperDiv.querySelector('.message-timestamp');
                    if (!existingTimestamp) {
                        // Add timestamp if not already present
                        const messageTimestamp = document.createElement('div');
                        messageTimestamp.className = 'message-timestamp';
                        const msgDate = new Date();
                        const formattedDate = msgDate.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        messageTimestamp.textContent = formattedDate;
                        wrapperDiv.appendChild(messageTimestamp);
                    }
                    
                    // Save the assistant's complete response to the transcript if needed
                    if (this.currentTranscriptId && shouldSaveToTranscript) {
                        // Check if this exact response is already in the transcript
                        const existingAssistantMessage = this.messages.find(msg => 
                            msg.role === 'assistant' && msg.content === accumulatedText
                        );
                        
                        if (!existingAssistantMessage) {
                            // Update messages array with the assistant's message
                            this.messages.push({
                                role: 'assistant',
                                content: accumulatedText,
                                timestamp: Date.now()
                            });
                            
                            await this.saveMessageToTranscript('assistant', accumulatedText);
                        }
                    }
                    
                    // Reset waiting flag and re-enable send button
                    this.isWaitingForResponse = false;
                    document.getElementById('send-button').disabled = false;
                    
                    // Ensure the final message is visible
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    break;
                }
                
                // Decode and accumulate the text
                const chunk = decoder.decode(value, { stream: true });
                
                // Check for tool call notifications
                let isJSONHandled = false;
                try {
                    const notification = JSON.parse(chunk);
                    if (notification && typeof notification === 'object' && notification.type === 'tool_call') {
                        isJSONHandled = true;
                        if (notification.status === 'started') {
                            toolCallInProgress = true;
                            currentToolName = notification.tool_name;
                            // Update loading text to show tool execution
                            if (wrapperDiv.contains(loadingDiv)) {
                                loadingDiv.innerHTML = `
                                    <div class="loading-text">Running ${currentToolName}</div>
                                    <div class="loading-dots">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                `;
                            }
                            continue;
                        } else if (notification.status === 'completed') {
                            toolCallInProgress = false;
                            currentToolName = '';
                            // Update loading text back to thinking
                            if (wrapperDiv.contains(loadingDiv)) {
                                loadingDiv.innerHTML = `
                                    <div class="loading-text">Thinking</div>
                                    <div class="loading-dots">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                `;
                            }
                            continue;
                        }
                    }
                } catch (e) {
                    // Not a JSON notification, treat as normal text
                    isJSONHandled = false;
                }
                
                // If JSON wasn't handled as a tool call notification (or was a primitive like a number),
                // treat it as regular text
                if (!isJSONHandled) {
                    accumulatedText += chunk;
                    
                    // If this is the first content chunk, remove the loading indicator
                    if (!hasStartedStreaming) {
                        hasStartedStreaming = true;
                        if (wrapperDiv.contains(loadingDiv)) {
                            wrapperDiv.removeChild(loadingDiv);
                        }
                        wrapperDiv.appendChild(contentDiv);
                        
                        // Make sure timestamp is visible after removing loading indicator
                        const existingTimestamp = wrapperDiv.querySelector('.message-timestamp');
                        if (existingTimestamp) {
                            // Move the timestamp to the end if it exists
                            wrapperDiv.appendChild(existingTimestamp);
                        }
                    }
                    
                    // Process the content to handle tool results
                    const parts = accumulatedText.split(/(Tool Results from [^:]+:)/);
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
                    
                    // Update the main content in real-time
                    mainContentDiv.innerHTML = md.render(mainContent);
                    
                    // Handle tool results if any
                    if (toolResults.length > 0) {
                        // Remove existing tool results if any
                        const existingToggle = contentDiv.querySelector('.tool-results-toggle');
                        const existingResults = contentDiv.querySelector('.tool-results-container');
                        if (existingToggle) contentDiv.removeChild(existingToggle);
                        if (existingResults) contentDiv.removeChild(existingResults);
                        
                        // Add new tool results
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
                    
                    // Scroll to bottom after each update
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Show error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message-content error';
            errorDiv.textContent = `Error: ${error.message}`;
            
            // Replace loading div with error message
            if (wrapperDiv.contains(loadingDiv)) {
                wrapperDiv.removeChild(loadingDiv);
            }
            wrapperDiv.appendChild(errorDiv);
            
            // Reset waiting flag and re-enable send button
            this.isWaitingForResponse = false;
            document.getElementById('send-button').disabled = false;
            
            // Ensure error message is visible
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    async startNewSession() {
        try {
            // Reset transcript state first
            this.currentTranscriptId = null;
            this.currentTranscriptName = "Untitled";
            
            // Then clear all messages in the UI and memory
            this.clearMessages();
            
            // Update UI
            if (this.transcriptNameDisplay) {
                this.transcriptNameDisplay.textContent = this.currentTranscriptName;
            }
            
            // Reset activity tracking
            this.hasActivity = false;
            this.hasBeenRenamed = false;
            
            // Clear any system prompt modifications by resetting to default
            try {
                // This will reset system message to default
                const response = await fetch(`${this.API_BASE_URL}/api/messages`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    console.error('Failed to reset messages on the server');
                }
            } catch (error) {
                console.error('Error resetting messages on the server:', error);
            }
            
            // Clear session state in localStorage
            localStorage.removeItem('currentSession');
            
            // Show notification
            if (window.showNotification) {
                window.showNotification('Started new session', 2000);
            }
        } catch (error) {
            console.error('Error starting new session:', error);
        }
    }

    async createNewTranscript() {
        try {
            // Create a new transcript with the current name
            const response = await fetch(`${API_BASE_URL}/api/transcripts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: this.currentTranscriptName,
                    messages: [] // Start with an empty messages array
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create transcript: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Validate response
            if (!data.transcript || !data.transcript.id) {
                throw new Error('Invalid response from server');
            }
            
            // Update transcript information
            this.currentTranscriptId = data.transcript.id;
            this.currentTranscriptName = data.transcript.name;
            
            // Update UI
            if (this.transcriptNameDisplay) {
                this.transcriptNameDisplay.textContent = this.currentTranscriptName;
                this.transcriptNameDisplay.classList.add('highlight');
                
                // Remove highlight after a few seconds
                setTimeout(() => {
                    this.transcriptNameDisplay.classList.remove('highlight');
                }, 5000);
            }
            
            console.log(`Created new transcript: ${this.currentTranscriptName} (ID: ${this.currentTranscriptId})`);
            
            // Notify transcript manager to refresh list if available
            if (window.transcriptManager) {
                window.transcriptManager.loadTranscripts();
            }
            
            return data.transcript;
        } catch (error) {
            console.error('Error creating transcript:', error);
            // Continue without a transcript ID - will use localStorage fallback
            return null;
        }
    }

    async renameCurrentTranscript() {
        const newName = prompt('Enter a new name for this conversation:', this.currentTranscriptName || 'Untitled');
        if (newName && newName !== this.currentTranscriptName) {
            this.currentTranscriptName = newName;
            this.hasBeenRenamed = true;
            
            if (this.currentTranscriptId) {
                this.updateTranscriptName(this.currentTranscriptId, newName);
            } else if (this.hasActivity) {
                // Create a new transcript if there's activity but no ID yet
                this.createNewTranscript();
            }
            
            // Use the global showNotification function
            if (window.showNotification) {
                window.showNotification(`Renamed to "${newName}"`, 2000);
            } else {
                console.log(`Renamed to "${newName}"`);
            }
            
            // Notify transcript manager to refresh
            if (window.transcriptManager) {
                window.transcriptManager.loadTranscripts();
            }
        }
    }

    async updateTranscriptName(transcriptId, newName) {
        if (!transcriptId) {
            console.warn('No transcript ID provided, skipping name update');
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${transcriptId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: newName
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Also update name in current instance
            this.currentTranscriptName = newName;
            
            // Save session state
            this.saveSessionState();
            
            return true;
        } catch (error) {
            console.error('Error updating transcript name:', error);
            
            // Fallback to localStorage
            try {
                const localTranscripts = JSON.parse(localStorage.getItem('transcripts') || '[]');
                const index = localTranscripts.findIndex(t => t.id === transcriptId);
                
                if (index !== -1) {
                    localTranscripts[index].name = newName;
                    localStorage.setItem('transcripts', JSON.stringify(localTranscripts));
                    
                    // Update name in current instance
                    this.currentTranscriptName = newName;
                    
                    // Save session state
                    this.saveSessionState();
                    
                    return true;
                }
            } catch (localError) {
                console.error('Error updating transcript name in localStorage:', localError);
            }
            
            return false;
        }
    }

    async updateTranscript() {
        if (!this.currentTranscriptId) {
            console.warn('No current transcript ID, skipping update');
            return;
        }

        try {
            // Get the current transcript to avoid overwriting changes
            const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${this.currentTranscriptId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (!data.transcript) {
                throw new Error('Invalid transcript data received');
            }
            
            // Instead of trying to extract messages from DOM, use the internal messages array
            // which is more reliable and already has the correct structure
            const currentMessages = this.messages || [];

            // Update the transcript with the messages array
            const updateResponse = await fetch(`${this.API_BASE_URL}/api/transcripts/${this.currentTranscriptId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    messages: currentMessages
                })
            });

            if (!updateResponse.ok) {
                throw new Error(`HTTP error! status: ${updateResponse.status}`);
            }

            // Save to localStorage for redundancy
            this.saveTranscriptToLocalStorage();
            
            // Save session state
            this.saveSessionState();

        } catch (error) {
            console.error('Error updating transcript:', error);
            // Use the global showNotification function instead of this.showNotification
            window.showNotification ? window.showNotification('Failed to update transcript', 3000) : 
                console.warn('Failed to update transcript');
                
            // Try to save to localStorage as backup
            this.saveTranscriptToLocalStorage();
        }
    }
    
    addMessage(role, content, timestamp = null) {
        const messagesContainer = this.messagesContainer;
        if (!messagesContainer) {
            console.error('Messages container not found');
            return null;
        }
        
        // Check if this is a duplicate of the last message (prevent duplicates)
        if (this.messages.length > 0) {
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage.role === role && lastMessage.content === content) {
                console.log('Duplicate message detected, skipping...');
                return null;
            }
        }
        
        // Add message to internal array
        const msgTimestamp = timestamp || Date.now();
        this.messages.push({
            role: role,
            content: content,
            timestamp: msgTimestamp
        });

        // Set the hasActivity flag to true when a message is added
        if (!this.hasActivity) {
            this.hasActivity = true;
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${role}`;
        messageElement.dataset.timestamp = msgTimestamp;
        
        // Create avatar for user or assistant
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        
        if (role === 'user') {
            avatar.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"></path></svg>`;
        } else {
            avatar.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,8.39C13.57,9.4 15.42,10 17.42,10C18.2,10 18.95,9.91 19.67,9.74C19.88,10.45 20,11.21 20,12C20,16.41 16.41,20 12,20C9,20 6.39,18.34 5,15.89L6.75,14V13A1.25,1.25 0 0,1 8,11.75A1.25,1.25 0 0,1 9.25,13V14H12M14.5,10.5C13.74,10.5 13.12,10.73 12.5,10.73C11.88,10.73 11.26,10.5 10.5,10.5C9.47,10.5 8.5,11.54 8.5,12.57C8.5,13.38 9.11,14 9.92,14H10.08C10.89,14 11.5,13.38 11.5,12.57C11.5,12.05 12.05,11.5 12.57,11.5C13.38,11.5 14,10.89 14,10.08V9.92C14,9.11 13.38,8.5 12.57,8.5C11.5,8.5 10.5,9.3 10.5,10.5"></path></svg>`;
        }
        
        messageElement.appendChild(avatar);
        
        // Create message content wrapper
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'message-content-wrapper';
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        if (role === 'assistant') {
            // Process the content to handle tool results
            const parts = content.split(/(Tool Results from [^:]+:)/);
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
            messageContent.appendChild(mainContentDiv);
            
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
                messageContent.appendChild(toggleLink);
                
                const resultsContainer = document.createElement('div');
                resultsContainer.className = 'tool-results-container';
                
                toolResults.forEach(result => {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'tool-result';
                    
                    const content = document.createElement('textarea');
                    content.className = 'tool-result-content';
                    content.value = result.content;
                    content.readOnly = true;
                    content.rows = 8;
                    
                    resultDiv.appendChild(content);
                    resultsContainer.appendChild(resultDiv);
                });
                
                messageContent.appendChild(resultsContainer);
            }
        } else {
            // User message or other role
            const md = window.markdownit({
                html: false,
                linkify: true,
                typographer: true
            });
            messageContent.innerHTML = md.render(content);
        }
        
        wrapperDiv.appendChild(messageContent);
        
        // Add timestamp
        const messageTimestamp = document.createElement('div');
        messageTimestamp.className = 'message-timestamp';
        
        // Format the timestamp
        const date = new Date(msgTimestamp);
        const formattedDate = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageTimestamp.textContent = formattedDate;
        
        // Add timestamp to wrapper
        wrapperDiv.appendChild(messageTimestamp);
        
        // Add wrapper to message element
        messageElement.appendChild(wrapperDiv);
        
        // Add message to UI
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        this.smoothScrollToBottom();
        
        // Save to transcript if we have an ID and saving is not temporarily disabled
        if (this.currentTranscriptId && this.saveMessageToTranscript !== (() => Promise.resolve(true))) {
            // Using setTimeout to make it non-blocking
            setTimeout(() => {
                try {
                    console.log(`Saving message to transcript ${this.currentTranscriptId} (role: ${role})`);
                    this.saveMessageToTranscript(role, content, msgTimestamp);
                } catch (error) {
                    console.error('Error saving message to transcript:', error);
                    
                    // If saving to the database fails, at least try localStorage
                    this.saveTranscriptToLocalStorage();
                }
            }, 0);
        } else if (this.hasActivity && role === 'user' && !this.currentTranscriptId) {
            // If the first user message is being added and we don't have a transcript yet,
            // create one and then save this message to it
            setTimeout(async () => {
                try {
                    // Create a new transcript
                    const transcript = await this.createNewTranscript();
                    if (transcript && transcript.id) {
                        // Now save the message to this new transcript
                        this.saveMessageToTranscript(role, content, msgTimestamp);
                    } else {
                        // Fallback to localStorage if transcript creation failed
                        this.saveTranscriptToLocalStorage();
                    }
                } catch (error) {
                    console.error('Error creating transcript from first message:', error);
                    this.saveTranscriptToLocalStorage();
                }
            }, 0);
        } else {
            // No transcript ID yet, save to localStorage only
            this.saveTranscriptToLocalStorage();
        }
        
        return messageElement;
    }
    
    clearMessages() {
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
        this.messages = [];
        
        // Only update transcript if we have a valid ID
        if (this.currentTranscriptId) {
            this.updateTranscript();
        }
    }
    
    getMessages() {
        return this.messages;
    }

    // New method to restore previous session
    async restoreSession() {
        try {
            const savedSession = localStorage.getItem('currentSession');
            if (!savedSession) return;
            
            const { transcriptId, name } = JSON.parse(savedSession);
            if (!transcriptId) return;
            
            console.log(`Restoring previous session: ${name} (${transcriptId})`);
            
            // Check if transcript manager exists
            if (window.transcriptManager) {
                // Use transcript manager to load the transcript
                await window.transcriptManager.loadTranscriptIntoChat(transcriptId);
            } else {
                // Directly fetch and load the transcript
                try {
                    // Try API first
                    const response = await fetch(`${this.API_BASE_URL}/api/transcripts/${transcriptId}`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        },
                        credentials: 'include'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.transcript && data.transcript.messages) {
                            // Set current transcript info
                            this.currentTranscriptId = transcriptId;
                            this.currentTranscriptName = data.transcript.name;
                            if (this.transcriptNameDisplay) {
                                this.transcriptNameDisplay.textContent = data.transcript.name;
                            }
                            this.hasActivity = true;
                            
                            // Clear existing messages
                            this.clearMessages();
                            
                            // Add messages to chat
                            for (const message of data.transcript.messages) {
                                if (message.role !== 'system') { // Skip system messages
                                    this.addMessage(message.role, message.content, message.timestamp);
                                }
                            }
                        }
                    } else {
                        throw new Error('Failed to fetch transcript from API');
                    }
                } catch (apiError) {
                    console.error('API error, trying localStorage:', apiError);
                    
                    // Try localStorage
                    const storedTranscripts = JSON.parse(localStorage.getItem('transcripts') || '[]');
                    const transcript = storedTranscripts.find(t => t.id === transcriptId);
                    
                    if (transcript && transcript.messages) {
                        // Set current transcript info
                        this.currentTranscriptId = transcriptId;
                        this.currentTranscriptName = transcript.name;
                        if (this.transcriptNameDisplay) {
                            this.transcriptNameDisplay.textContent = transcript.name;
                        }
                        this.hasActivity = true;
                        
                        // Clear existing messages
                        this.clearMessages();
                        
                        // Add messages to chat
                        for (const message of transcript.messages) {
                            if (message.role !== 'system') { // Skip system messages
                                this.addMessage(message.role, message.content, message.timestamp);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error restoring session:', error);
        }
    }
}

// Initialize and expose the chat interface globally
document.addEventListener('DOMContentLoaded', () => {
    // Initialize any existing functionality
    
    // Add chat interface initialization
    window.chatInterface = new ChatInterface();
});

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.querySelector('.chat-input textarea');
    const chatMessages = document.querySelector('.chat-messages');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-chat');
    const modelConfigButton = document.getElementById('config-chat');
    
    // Process any queued windowManager callbacks
    if (window.windowManager && window._windowManagerQueue && window._windowManagerQueue.length > 0) {
        const callbacks = [...window._windowManagerQueue];
        window._windowManagerQueue = [];
        callbacks.forEach(callback => callback(window.windowManager));
    }
    
    // Initialize transcripts, file explorer and other components
    let isProcessing = false;
    let fileTree = [];
    let selectedFiles = new Set();
    let contextMenu = null;
    let searchTimeout = null;
    
    // Initialize global variables for file attachments
    window.pendingAttachments = [];
    window.selectedFiles = new Set();
    
    let currentFocusedItem = null;
    let lastSelectedItem = null;
    let cachedModels = null; // Cache for available models
    
    // Expose functions to window for global access
    window.updateFileAttachments = updateFileAttachments;
    window.removeFileAttachment = removeFileAttachment;
    
    // Theme handling
    const themeToggle = document.getElementById('theme-toggle-input');
    const root = document.documentElement;
    
    // Initialize window manager queue for deferred callbacks
    if (!window._windowManagerQueue) {
        window._windowManagerQueue = [];
    }
    
    // Helper function to use window manager safely
    function withWindowManager(callback) {
        if (window.windowManager) {
            callback(window.windowManager);
        } else {
            window._windowManagerQueue.push(callback);
        }
    }

    // Initialize theme from localStorage or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    root.setAttribute('data-theme', savedTheme);
    themeToggle.checked = savedTheme === 'light'; // Invert the checked state

    // Handle theme toggle
    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
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

    // Configure markdown-it options
    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true, // Enable automatic line breaks
        maxNesting: 100,
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang }).value;
                } catch (__) {}
            }
            return ''; // use external default escaping
        }
    });

    // Enable available markdown-it plugins
    if (window.markdownitEmoji) {
        md.use(window.markdownitEmoji);
    }
    if (window.markdownitTaskLists) {
        md.use(window.markdownitTaskLists);
    }

    // Add custom renderer rules to control spacing
    md.renderer.rules.paragraph_open = function() {
        return '<p style="margin: 0.25em 0;">';
    };

    md.renderer.rules.list_item_open = function(tokens, idx) {
        const token = tokens[idx];
        const info = token.info;
        return `<li style="margin: 0.1em 0; list-style-type: decimal;">`;
    };

    md.renderer.rules.heading_open = function(tokens, idx) {
        const level = tokens[idx].tag;
        return `<h${level} style="margin: 0.5em 0 0.25em 0;">`;
    };

    // Add rule to control spacing between list items
    md.renderer.rules.bullet_list_open = function() {
        return '<ul style="margin: 0.25em 0;">';
    };

    md.renderer.rules.ordered_list_open = function() {
        return '<ol style="margin: 0.25em 0; counter-reset: item;">';
    };

    // Override the default ordered list item renderer
    md.renderer.rules.ordered_list_item_open = function(tokens, idx) {
        const token = tokens[idx];
        const info = token.info;
        return `<li style="margin: 0.1em 0; display: list-item; list-style-type: decimal;">`;
    };

    // Add custom rule for ordered list item content
    md.renderer.rules.ordered_list_item_close = function() {
        return '</li>';
    };

    // Initialize textarea height
    function initTextarea() {
        chatInput.style.height = '24px';
        chatInput.style.overflowY = 'hidden';
    }

    // Adjust textarea height
    function adjustTextareaHeight() {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    }

    // Add message to chat interface
    function addMessage(text, sender, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}${isError ? ' error' : ''}`;
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content-wrapper';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
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
        
        // Process the message content to handle tool results
        const parts = text.split(/(Tool Results from [^:]+:)/);
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
        
        // Render the main content
        messageContent.innerHTML = md.render(mainContent);
        
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
            messageContent.appendChild(toggleLink);
            
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
            
            messageContent.appendChild(resultsContainer);
        }
        
        contentWrapper.appendChild(messageContent);
        messageDiv.appendChild(contentWrapper);
        
        const messagesContainer = document.querySelector('.chat-messages');
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Show loading indicator
    function showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant loading';
        loadingDiv.innerHTML = `
            <div class="loading-content">
                <span class="loading-text">Thinking</span>
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return loadingDiv;
    }

    // Remove loading indicator
    function removeLoading(loadingDiv) {
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    // Update loading text
    function updateLoadingText(loadingDiv, text) {
        if (loadingDiv) {
            const textSpan = loadingDiv.querySelector('.loading-text');
            if (textSpan) {
                textSpan.textContent = text;
            }
        }
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
        // Limit filename to 12 characters, adding ellipsis if longer
        const displayName = filename.length > 12 ? filename.substring(0, 12) + '...' : filename;
        
        const attachment = window.pendingAttachments[index];
        const isLoading = attachment && attachment.loading;
        
        chip.innerHTML = `
            <span class="file-name" title="${filename}">${displayName}</span>
            ${isLoading ? '<span class="loading-spinner"></span>' : ''}
            <span class="remove-file" data-index="${index}" title="Remove file">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </span>
        `;
        
        if (isLoading) {
            chip.classList.add('loading');
        }
        
        return chip;
    }

    // Update file attachments display
    function updateFileAttachments() {
        const container = document.querySelector('.file-attachments');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!window.pendingAttachments || !window.pendingAttachments.length) {
            return;
        }
        
        window.pendingAttachments.forEach((attachment, index) => {
            const chip = createFileChip(attachment.filename, index);
            container.appendChild(chip);
        });
    }

    // Remove file attachment
    function removeFileAttachment(index) {
        if (!window.pendingAttachments) return;
        window.pendingAttachments.splice(index, 1);
        updateFileAttachments();
    }

    // File upload handling
    function handleFileUpload(file) {
        if (!window.pendingAttachments) {
            window.pendingAttachments = [];
        }
        
        // Check if file with the same name is already attached
        const isAlreadyAttached = window.pendingAttachments.some(att => att.filename === file.name);
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
            window.pendingAttachments.push({
                filename: data.filename,
                text: data.extracted_text || ""
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

    // Add preview cache object
    const previewCache = new Map();

    // Update preview panel
    async function updatePreview(path) {
        const previewPanel = document.getElementById('preview-panel');
        
        // Check if preview is already cached
        if (previewCache.has(path)) {
            previewPanel.innerHTML = previewCache.get(path);
            previewPanel.classList.remove('loading');
            return;
        }
        
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
                <div class="preview-header" data-path="${path}">${fileInfo.name}</div>
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
                    <div class="preview-content">
                        <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                            <img src="user_data/${path}" 
                                 alt="${fileInfo.name}"
                                 style="max-width: 100%; max-height: 100%; object-fit: contain;">
                        </div>
                    </div>
                `;
            } else if (fileInfo.preview) {
                html += `
                    <div class="preview-content">
                        ${fileInfo.preview}
                    </div>
                `;
            }

            // Cache the preview HTML
            previewCache.set(path, html);
            
            // Update the preview panel
            previewPanel.innerHTML = html;
            previewPanel.classList.remove('loading');
            
        } catch (error) {
            console.error('Error updating preview:', error);
            previewPanel.innerHTML = `<div class="error-message">Error loading preview: ${error.message}</div>`;
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

    // Handle file cut
    async function handleCut(paths) {
        // Store paths in localStorage for paste operation
        localStorage.setItem('clipboard', JSON.stringify({
            operation: 'cut',
            paths: Array.from(paths)
        }));
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
        if (!clipboard || !clipboard.paths || clipboard.paths.length === 0) return;

        try {
            // Get the target item to determine if it's a file or directory
            const targetItem = document.querySelector(`.file-tree-item[data-path="${targetPath}"]`);
            
            // Determine the actual destination path
            let actualDestinationPath;
            if (targetItem) {
                if (targetItem.classList.contains('directory')) {
                    // If target is a directory, use it directly
                    actualDestinationPath = targetPath;
                } else {
                    // If target is a file, use its parent directory
                    const parentItem = findParentItem(targetItem);
                    actualDestinationPath = parentItem ? parentItem.dataset.path : '';
                }
            } else {
                // If no specific target, use the root
                actualDestinationPath = '';
            }

            // Process each item in the clipboard
            for (const path of clipboard.paths) {
                // Get the item to determine if it's a directory
                const sourceItem = document.querySelector(`.file-tree-item[data-path="${path}"]`);
                const isDirectory = sourceItem && sourceItem.classList.contains('directory');
                
                // Construct the destination path
                const destination = actualDestinationPath 
                    ? `${actualDestinationPath}/${path.split('/').pop()}`
                    : path.split('/').pop();

                if (clipboard.operation === 'copy') {
                    // Copy operation
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/files/copy`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({
                                source: path,
                                destination: destination,
                                is_directory: isDirectory
                            })
                        });
                        
                        if (!response.ok) {
                            let errorMessage = 'Failed to copy item';
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
                    } catch (error) {
                        console.error('Error during copy operation:', error);
                        showNotification(`Error copying item: ${error.message}`, 3000);
                        continue; // Continue with next item if one fails
                    }
                } else if (clipboard.operation === 'cut') {
                    // Cut operation (move)
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/files/move`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({
                                source: path,
                                destination: destination
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
                    } catch (error) {
                        console.error('Error during move operation:', error);
                        showNotification(`Error moving item: ${error.message}`, 3000);
                        continue; // Continue with next item if one fails
                    }
                }
            }
            
            // Clear the clipboard after a cut operation
            if (clipboard.operation === 'cut') {
                localStorage.removeItem('clipboard');
            }
            
            // Refresh the file tree to show the changes
            await refreshFileTree();
            
        } catch (error) {
            console.error('Error in paste operation:', error);
            showNotification(`Error pasting items: ${error.message}`, 3000);
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
                label: 'View',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>',
                action: () => {
                    const path = selectedFiles.values().next().value;
                    if (path) {
                        createDocumentReader(path);
                    }
                },
                disabled: isDirectory
            },
            {
                label: 'Copy',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>',
                action: () => handleCopy(selectedFiles)
            },
            {
                label: 'Cut',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,3L13,9L15,11L22,4V3M12,12.5A0.5,0.5 0 0,1 11.5,12A0.5,0.5 0 0,1 12,11.5A0.5,0.5 0 0,1 12.5,12A0.5,0.5 0 0,1 12,12.5M13,4.2L18.6,9.8L21,7.4L22.4,8.8C22.4,8.8 22.4,8.8 22.4,8.8C22.8,9.2 22.8,9.8 22.4,10.2L21.7,10.9L18.6,14L16.2,11.6L4.8,23H3V21.2L13,11.2M10,5V2H8V5H5V7H8V10H10V7H13V5H10Z"/></svg>',
                action: () => handleCut(selectedFiles)
            },
            {
                label: 'Paste',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,20H5V4H7V7H17V4H19M12,2A1,1 0 0,1 13,3A1,1 0 0,1 12,4A1,1 0 0,1 11,3A1,1 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>',
                action: () => handlePaste(selectedFiles.values().next().value)
            },
            {
                label: 'Rename',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.41,5.8L17.2,4.59C16.41,3.8 15.14,3.8 14.34,4.59L4.59,14.34L3,21L9.66,19.41L19.41,9.66C20.2,8.86 20.2,7.59 19.41,6.8M6.21,18.21L5.08,17.08L13.6,8.56L14.74,9.7L6.21,18.21M7.45,16.96L15.97,8.44L16.74,9.21L8.22,17.73L7.45,16.96Z"/></svg>',
                action: () => handleRename(selectedFiles.values().next().value)
            },
            { type: 'separator' },
            {
                label: 'Delete',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>',
                action: () => handleDelete(),
                danger: true
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
                if (item.disabled) {
                    menuItem.classList.add('disabled');
                }
                if (item.danger) {
                    menuItem.classList.add('danger');
                    menuItem.style.color = 'var(--error-color)';
                }
                menuItem.innerHTML = `
                    <div class="icon">${item.icon}</div>
                    <span>${item.label}</span>
                `;
                if (!item.disabled) {
                    menuItem.addEventListener('click', () => {
                        item.action();
                        contextMenu.remove();
                    });
                }
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
        
        // Allow directory selection (removing the directory check)
        
        if (isRangeSelect) {
            // Range selection with Shift
            const allItems = Array.from(document.querySelectorAll('.file-tree-item'));
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
        
        // Include all items, both files and directories
        const allItems = Array.from(document.querySelectorAll('.file-tree-item'));
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
        // Don't process keypresses when focused on chat input or other inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        const treeContainer = document.getElementById('file-tree');
        if (!treeContainer) return;
        
        // If no item is focused yet, focus the first one
        if (!currentFocusedItem) {
            const firstItem = treeContainer.querySelector('.file-tree-item');
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
                    const allItems = Array.from(document.querySelectorAll('.file-tree-item'));
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
                }
                break;
                
            case ' ': // Space
                e.preventDefault();
                if (currentFocusedItem) {
                    // Toggle item selection without losing focus
                    if (selectedFiles.has(currentFocusedItem.dataset.path)) {
                        selectedFiles.delete(currentFocusedItem.dataset.path);
                        currentFocusedItem.classList.remove('selected');
                    } else {
                        if (!e.ctrlKey && !e.metaKey) {
                            // Clear other selections if not multi-select
                            selectedFiles.clear();
                            document.querySelectorAll('.file-tree-item.selected').forEach(el => {
                                el.classList.remove('selected');
                            });
                        }
                        selectedFiles.add(currentFocusedItem.dataset.path);
                        currentFocusedItem.classList.add('selected');
                    }
                }
                break;
                
            case 'a':
                // Select all files if Ctrl/Cmd+A
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    const items = Array.from(document.querySelectorAll('.file-tree-item'));
                    selectedFiles.clear();
                    
                    items.forEach(item => {
                        selectedFiles.add(item.dataset.path);
                        item.classList.add('selected');
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
        
        // Set focused item
        focusFileTreeItem(item);

        // Check if clicking on toggle button for directories
        const toggle = e.target.closest('.toggle');
        if (toggle && item.classList.contains('directory')) {
            toggleDirectory(item);
            return;
        }

        // Handle double-click for files
        if (e.detail === 2 && !item.classList.contains('directory')) {
            const path = item.dataset.path;
            const filename = path.split('/').pop();
            
            // Check if file is already attached
            const isAlreadyAttached = window.pendingAttachments.some(att => att.filename === filename);
            if (isAlreadyAttached) {
                showNotification(`File ${filename} is already attached`, 2000);
                return;
            }

            // Add file to pending attachments immediately with loading state
            window.pendingAttachments.push({
                filename: filename,
                text: "",
                loading: true
            });
            updateFileAttachments();

            // Get file content and update the attachment
            fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to get file info');
                    return response.json();
                })
                .then(data => {
                    if (data.preview) {
                        // Update the existing attachment with the content
                        const attachment = window.pendingAttachments.find(att => att.filename === filename);
                        if (attachment) {
                            attachment.text = data.preview;
                            attachment.loading = false;
                            updateFileAttachments();
                        }
                    }
                })
                .catch(error => {
                    console.error('Error getting file content:', error);
                    // Remove the failed attachment
                    const index = window.pendingAttachments.findIndex(att => att.filename === filename);
                    if (index !== -1) {
                        window.pendingAttachments.splice(index, 1);
                        updateFileAttachments();
                    }
                    showNotification(`Error getting file content: ${error.message}`, 3000);
                });
            return;
        }

        // Handle item selection
        selectFileTreeItem(
            item,
            e.ctrlKey || e.metaKey, // Multi-select
            e.shiftKey // Range select
        );
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
            let targetPath = '';
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
                    path: targetPath ? `${targetPath}/${name}` : name
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
        try {
            if (selectedFiles.size === 0) return;
            
            const fileList = Array.from(selectedFiles);
            const confirmMessage = fileList.length === 1
                ? `Are you sure you want to delete "${fileList[0].split('/').pop()}"?`
                : `Are you sure you want to delete ${fileList.length} items?`;
            
            if (!confirm(confirmMessage)) return;
            
            // Delete each selected file/folder
            for (const path of fileList) {
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
                    let errorMessage = `Failed to delete ${path}`;
                    try {
                        const data = await response.json();
                        errorMessage = data.error || errorMessage;
                    } catch {
                        // If response is not JSON, use the status text
                        errorMessage = response.statusText || errorMessage;
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

    // Event listeners
    sendButton.addEventListener('click', () => window.chatInterface.handleSendMessage());
    
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation(); // Prevent event from bubbling up to document
            window.chatInterface.handleSendMessage();
        }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', adjustTextareaHeight);

    // Add resize handles to panes
    function initResizableColumns() {
        const panes = document.querySelectorAll('.pane');
        const defaultWidths = {
            'file-explorer': '300px',
            'ai-chat': 'auto',
            'tools': '400px'
        };

        // Load saved widths from localStorage
        const savedWidths = JSON.parse(localStorage.getItem('paneWidths')) || {};
        
        // Apply saved widths or defaults
        panes.forEach(pane => {
            const paneClass = Array.from(pane.classList).find(cls => cls !== 'pane');
            const savedWidth = savedWidths[paneClass];
            if (savedWidth) {
                pane.style.width = savedWidth;
            } else if (defaultWidths[paneClass]) {
                pane.style.width = defaultWidths[paneClass];
            }
        });

        // Add reset layout button handlers
        document.querySelectorAll('#reset-layout').forEach(button => {
            button.addEventListener('click', () => {
                // Reset to default widths
                panes.forEach(pane => {
                    const paneClass = Array.from(pane.classList).find(cls => cls !== 'pane');
                    if (defaultWidths[paneClass]) {
                        pane.style.width = defaultWidths[paneClass];
                    }
                });
                // Clear saved widths
                localStorage.removeItem('paneWidths');
                showNotification('Layout reset to defaults');
            });
        });
        
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
                    if (!isResizing) return;
                    isResizing = false;
                    handle.classList.remove('active');

                    // Save the new widths to localStorage
                    const widths = {};
                    panes.forEach(pane => {
                        const paneClass = Array.from(pane.classList).find(cls => cls !== 'pane');
                        widths[paneClass] = pane.style.width;
                    });
                    localStorage.setItem('paneWidths', JSON.stringify(widths));
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
        let isMaximized = false;
        const defaultHeight = 120;
        const containerHeight = fileTreeContainer.parentElement.offsetHeight;
        const maxHeight = Math.floor(window.innerHeight / 2);

        // Add click handler for preview header
        previewPanel.addEventListener('click', (e) => {
            const header = e.target.closest('.preview-header');
            if (!header) return;
            
            const previewContent = previewPanel.querySelector('.preview-content');
            
            if (isMaximized) {
                // Restore to default height
                previewPanel.style.height = `${defaultHeight}px`;
                fileTreeContainer.style.height = `${containerHeight - defaultHeight - 4}px`;
                if (previewContent) previewContent.style.display = 'none';
            } else {
                // Maximize the preview to half window height
                previewPanel.style.height = `${maxHeight}px`;
                fileTreeContainer.style.height = `${containerHeight - maxHeight - 4}px`;
                if (previewContent) previewContent.style.display = 'block';
            }
            isMaximized = !isMaximized;
        });

        // Double click handler for resize handle
        resizeHandle.addEventListener('dblclick', () => {
            const previewContent = previewPanel.querySelector('.preview-content');
            
            if (isMaximized) {
                // Restore to default height
                previewPanel.style.height = `${defaultHeight}px`;
                fileTreeContainer.style.height = `${containerHeight - defaultHeight - 4}px`;
                if (previewContent) previewContent.style.display = 'none';
            } else {
                // Maximize the preview to half window height
                previewPanel.style.height = `${maxHeight}px`;
                fileTreeContainer.style.height = `${containerHeight - maxHeight - 4}px`;
                if (previewContent) previewContent.style.display = 'block';
            }
            isMaximized = !isMaximized;
        });

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
        
        // Show notification with a slight delay for animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentElement) {
                    document.body.removeChild(notification);
                }
            }, 300); // Match the CSS transition timing
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
            // Add to selected files without updating preview
            selectedFiles.add(item.dataset.path);
            item.classList.add('selected');
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
        const target = e.target.closest('.file-tree-item');
        const fileTree = document.getElementById('file-tree');
        
        // Remove drag-over from all items
        document.querySelectorAll('.file-tree-item.drag-over, #file-tree.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        // Add drag-over class to target
        if (target) {
            target.classList.add('drag-over');
        } else if (fileTree.contains(e.target) || fileTree === e.target) {
            // Allow dropping directly on the file tree (root)
            fileTree.classList.add('drag-over');
        }
        
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDragLeave(e) {
        const target = e.target.closest('.file-tree-item');
        const fileTree = document.getElementById('file-tree');
        
        if (target) {
            target.classList.remove('drag-over');
        } else if (fileTree === e.target || fileTree.contains(e.target)) {
            fileTree.classList.remove('drag-over');
        }
    }

    async function handleDrop(e) {
        e.preventDefault();
        
        // Get the target directory
        const targetItem = e.target.closest('.file-tree-item');
        const fileTree = document.getElementById('file-tree');
        
        let targetPath;
        
        // Check if dropping on a specific item or directly on the file tree
        if (targetItem) {
            // If target is not a directory, use its parent directory
            if (!targetItem.classList.contains('directory')) {
                const parentItem = findParentItem(targetItem);
                if (parentItem) {
                    targetPath = parentItem.dataset.path;
                } else {
                    // If no parent found, use the root directory
                    targetPath = '';
                }
            } else {
                targetPath = targetItem.dataset.path;
            }
        } else if (fileTree.contains(e.target) || fileTree === e.target) {
            // If dropping directly on the file tree (root), use empty path for root
            targetPath = '';
        } else {
            // Not a valid drop target
            return;
        }
        
        // Get all selected items to move
        const selectedItems = document.querySelectorAll('.file-tree-item.selected');
        const pathsToMove = Array.from(selectedItems).map(item => item.dataset.path);
        if (pathsToMove.length === 0) return;
        
        try {
            // Move each selected item
            for (const path of pathsToMove) {
                // Check if we're trying to move a directory into itself or its subdirectories
                if (path === targetPath || (targetPath !== '' && targetPath.startsWith(path + '/'))) {
                    showNotification('Cannot move a directory into itself or its subdirectories', 3000);
                    continue;
                }

                // Get current item type (file or directory)
                const isDirectory = document.querySelector(`.file-tree-item[data-path="${path}"]`).classList.contains('directory');

                // Construct the destination path
                const itemName = path.split('/').pop();
                
                // Construct the destination path appropriately
                let destination;
                if (targetPath === '') {
                    // If dropping to root, just use the filename without a path prefix
                    destination = itemName;
                } else {
                    // Otherwise use the target path plus filename
                    destination = targetPath + '/' + itemName;
                }
                
                // Check if the item is already in this location
                if (path === destination) {
                    console.log(`Skipping move of ${path} as it's already at the destination`);
                    continue;
                }

                // Check if destination already exists
                try {
                    const checkResponse = await fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(destination)}`);
                    if (checkResponse.ok) {
                        const existsData = await checkResponse.json();
                        if (existsData.exists) {
                            // If destination exists, append a number to make it unique
                            let counter = 1;
                            let newDestination = destination;
                            while (true) {
                                const checkUnique = await fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(newDestination)}`);
                                if (!checkUnique.ok) break;
                                const uniqueData = await checkUnique.json();
                                if (!uniqueData.exists) break;
                                newDestination = `${destination} (${counter})`;
                                counter++;
                            }
                            destination = newDestination;
                        }
                    }
                } catch (error) {
                    console.error('Error checking destination:', error);
                }

                console.log(`Moving from ${path} to ${destination}`);
                
                const response = await fetch(`${API_BASE_URL}/api/files/move`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        source: path,
                        destination: destination,
                        is_directory: isDirectory
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
            document.querySelectorAll('.file-tree-item.drag-over, #file-tree.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            document.querySelectorAll('.file-tree-item.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
            
        } catch (error) {
            console.error('Error moving items:', error);
            showNotification(`Error moving item: ${error.message}`, 3000);
            
            // Clean up drag state even on error
            document.querySelectorAll('.file-tree-item.drag-over, #file-tree.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
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
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    `;
                    searchInput.parentNode.appendChild(clearButton);

                    // Handle search input
                    searchInput.addEventListener('input', (e) => {
                        const query = e.target.value.trim();
                        if (query) {
                            handleFileSearch(query);
                            clearButton.style.display = 'flex';
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
                        searchInput.focus(); // Add focus back to the input after clearing
                    });

                    // Show/hide clear button based on input
                    searchInput.addEventListener('focus', () => {
                        if (searchInput.value) {
                            clearButton.style.display = 'flex';
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

    // Store default themes
    const defaultThemes = {
        dark: {
            '--bg-primary': '#0d1117',
            '--bg-secondary': '#161b22',
            '--bg-tertiary': '#21262d',
            '--text-primary': '#c9d1d9',
            '--text-secondary': '#8b949e',
            '--border-color': '#30363d',
            '--accent-color': '#2f81f7',
            '--hover-color': '#1f2937',
            '--user-message-bg': '#1f2937',
            '--assistant-message-bg': '#161b22',
            '--error-color': '#f85149',
            '--button-bg': '#2f3640',
            '--button-hover-bg': '#3d4451',
            '--button-active': '#2f81f7',
            '--button-text': '#8b949e',
            '--button-hover-text': '#c9d1d9',
            '--focus-color': '#2f81f7',
            '--selection-bg': 'rgba(47, 129, 247, 0.1)',
            '--selection-border': 'rgba(47, 129, 247, 0.3)'
        },
        light: {
            '--bg-primary': '#ffffff',
            '--bg-secondary': '#f6f8fa',
            '--bg-tertiary': '#ebedef',
            '--text-primary': '#24292f',
            '--text-secondary': '#57606a',
            '--border-color': '#d0d7de',
            '--accent-color': '#0969da',
            '--hover-color': '#f3f4f6',
            '--user-message-bg': '#f3f4f6',
            '--assistant-message-bg': '#ffffff',
            '--error-color': '#cf222e',
            '--button-bg': '#f3f4f6',
            '--button-hover-bg': '#e5e7eb',
            '--button-active': '#0969da',
            '--button-text': '#57606a',
            '--button-hover-text': '#24292f',
            '--focus-color': '#0969da',
            '--selection-bg': 'rgba(9, 105, 218, 0.1)',
            '--selection-border': 'rgba(9, 105, 218, 0.3)'
        }
    };

    // Store current custom themes
    let currentCustomThemes = {
        dark: null,
        light: null
    };

    function generateThemeFromPrimaryColor(primaryColor, isDark = true) {
        // Convert hex to HSL
        const hexToHSL = (hex) => {
            hex = hex.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            
            let l = (max + min) / 2;
            let s = 0;
            if (max !== min) {
                s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
            }
      
            let h = 0;
            if (max !== min) {
                switch (max) {
                    case r: h = (g - b) / (max - min) + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / (max - min) + 2; break;
                    case b: h = (r - g) / (max - min) + 4; break;
                }
                h /= 6;
            }
            
            return [h * 360, s * 100, l * 100];
        };

        const hslToHex = (h, s, l) => {
            l /= 100;
            const a = s * Math.min(l, 1 - l) / 100;
            const f = n => {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            };
            return `#${f(0)}${f(8)}${f(4)}`;
        };

        const [h, s, l] = hexToHSL(primaryColor);
        
        if (isDark) {
            // Dark theme generation
            const bgPrimary = hslToHex(h, s, 8);
            const bgSecondary = hslToHex(h, s, 12);
            const bgTertiary = hslToHex(h, s, 16);
            const textPrimary = hslToHex(h, s, 85);
            const textSecondary = hslToHex(h, s, 60);
            const borderColor = hslToHex(h, s, 20);
            const hoverColor = hslToHex(h, s, 25);
            const buttonBg = hslToHex(h, s, 22);
            const buttonHoverBg = hslToHex(h, s, 28);
            
            // Fixed colors for error and highlight states
            const errorColor = '#f85149'; // GitHub's error red
            const errorHover = '#ff6b6b'; // Slightly lighter red for hover
            const highlightColor = '#ffd700'; // Yellow for highlights
            const highlightText = '#000000'; // Black text for highlights
            const highlightBg = 'rgba(255, 215, 0, 0.2)';
            
            return {
                '--bg-primary': bgPrimary,
                '--bg-primary-rgb': hexToRgb(bgPrimary),
                '--bg-secondary': bgSecondary,
                '--bg-secondary-rgb': hexToRgb(bgSecondary),
                '--bg-tertiary': bgTertiary,
                '--bg-tertiary-rgb': hexToRgb(bgTertiary),
                '--text-primary': textPrimary,
                '--text-secondary': textSecondary,
                '--border-color': borderColor,
                '--accent-color': primaryColor,
                '--accent-color-rgb': hexToRgb(primaryColor),
                '--accent-color-transparent': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--hover-color': `rgba(${hexToRgb(primaryColor)}, 0.2)`,
                '--user-message-bg': hoverColor,
                '--assistant-message-bg': bgSecondary,
                '--error-color': errorColor,
                '--error-hover': errorHover,
                '--error-bg': 'rgba(248, 81, 73, 0.1)',
                '--button-bg': buttonBg,
                '--button-hover-bg': buttonHoverBg,
                '--button-active': primaryColor,
                '--button-text': textSecondary,
                '--button-hover-text': textPrimary,
                '--focus-color': primaryColor,
                '--selection-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--selection-border': `rgba(${hexToRgb(primaryColor)}, 0.3)`,
                '--highlight-color': highlightColor,
                '--highlight-text': highlightText,
                '--highlight-bg': highlightBg,
                '--primary-color': primaryColor,
                '--accent-hover': buttonHoverBg,
                '--hover-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--selected-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`
            };
        } else {
            // Light theme generation
            const bgPrimary = hslToHex(h, s, 100);
            const bgSecondary = hslToHex(h, s, 98);
            const bgTertiary = hslToHex(h, s, 96);
            const textPrimary = hslToHex(h, s, 20);
            const textSecondary = hslToHex(h, s, 40);
            const borderColor = hslToHex(h, s, 90);
            const hoverColor = hslToHex(h, s, 95);
            const buttonBg = hslToHex(h, s, 96);
            const buttonHoverBg = hslToHex(h, s, 92);
            
            // Fixed colors for error and highlight states
            const errorColor = '#cf222e'; // GitHub's error red for light theme
            const errorHover = '#ff6b6b'; // Slightly lighter red for hover
            const highlightColor = '#ffd700'; // Yellow for highlights
            const highlightText = '#000000'; // Black text for highlights
            const highlightBg = 'rgba(255, 215, 0, 0.2)';
            
            return {
                '--bg-primary': bgPrimary,
                '--bg-primary-rgb': hexToRgb(bgPrimary),
                '--bg-secondary': bgSecondary,
                '--bg-secondary-rgb': hexToRgb(bgSecondary),
                '--bg-tertiary': bgTertiary,
                '--bg-tertiary-rgb': hexToRgb(bgTertiary),
                '--text-primary': textPrimary,
                '--text-secondary': textSecondary,
                '--border-color': borderColor,
                '--accent-color': primaryColor,
                '--accent-color-rgb': hexToRgb(primaryColor),
                '--accent-color-transparent': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--hover-color': `rgba(${hexToRgb(primaryColor)}, 0.2)`,
                '--user-message-bg': hoverColor,
                '--assistant-message-bg': bgSecondary,
                '--error-color': errorColor,
                '--error-hover': errorHover,
                '--error-bg': 'rgba(207, 34, 46, 0.1)',
                '--button-bg': buttonBg,
                '--button-hover-bg': buttonHoverBg,
                '--button-active': primaryColor,
                '--button-text': textSecondary,
                '--button-hover-text': textPrimary,
                '--focus-color': primaryColor,
                '--selection-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--selection-border': `rgba(${hexToRgb(primaryColor)}, 0.3)`,
                '--highlight-color': highlightColor,
                '--highlight-text': highlightText,
                '--highlight-bg': highlightBg,
                '--primary-color': primaryColor,
                '--accent-hover': buttonHoverBg,
                '--hover-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`,
                '--selected-bg': `rgba(${hexToRgb(primaryColor)}, 0.1)`
            };
        }
    }
    
    // Helper to convert hex to rgb
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }

    // Theme color picker
    const themeColorPicker = document.getElementById('theme-color-picker');
    
    // Load saved theme color from localStorage
    const savedThemeColor = localStorage.getItem('themeColor');
    if (savedThemeColor) {
        themeColorPicker.value = savedThemeColor;
        // Generate and apply themes with saved color
        currentCustomThemes.dark = generateThemeFromPrimaryColor(savedThemeColor, true);
        currentCustomThemes.light = generateThemeFromPrimaryColor(savedThemeColor, false);
        const isDark = root.getAttribute('data-theme') === 'dark';
        applyTheme(isDark ? currentCustomThemes.dark : currentCustomThemes.light);
    }

    themeColorPicker.addEventListener('input', function(e) {
        // Save the selected color to localStorage
        localStorage.setItem('themeColor', e.target.value);
        
        // Generate both light and dark themes
        currentCustomThemes.dark = generateThemeFromPrimaryColor(e.target.value, true);
        currentCustomThemes.light = generateThemeFromPrimaryColor(e.target.value, false);
        
        // Apply the appropriate theme based on current toggle state
        const isDark = root.getAttribute('data-theme') === 'dark';
        applyTheme(isDark ? currentCustomThemes.dark : currentCustomThemes.light);
    });

    // Theme toggle
    themeToggle.addEventListener('change', function(e) {
        const isDark = !e.target.checked; // Invert the checked state
        const theme = isDark ? 'dark' : 'light';
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Apply the appropriate theme
        if (currentCustomThemes.dark && currentCustomThemes.light) {
            applyTheme(isDark ? currentCustomThemes.dark : currentCustomThemes.light);
        } else {
            applyTheme(defaultThemes[theme]);
        }
    });

    // Reset theme button
    const resetThemeButton = document.getElementById('reset-theme');
    resetThemeButton.addEventListener('click', function() {
        // Clear custom themes
        currentCustomThemes = { dark: null, light: null };
        
        // Get current theme mode
        const isDark = root.getAttribute('data-theme') === 'dark';
        
        // Reset color picker to default
        themeColorPicker.value = isDark ? '#2f81f7' : '#0969da';
        
        // Clear saved theme color from localStorage
        localStorage.removeItem('themeColor');
        
        // Apply default theme
        const defaultTheme = defaultThemes[isDark ? 'dark' : 'light'];
        applyTheme(defaultTheme);
        
        // Force a re-render of all elements by temporarily toggling the theme
        root.setAttribute('data-theme', isDark ? 'light' : 'dark');
        setTimeout(() => {
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
            applyTheme(defaultTheme);
        }, 0);
        
        showNotification('Theme reset to defaults');
    });

    function applyTheme(theme) {
        Object.entries(theme).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    // Track all open document readers
    const documentReaders = new Map(); // Changed from Set to Map to track by file path

    async function loadFileContent(path, reader) {
        try {
            const contentDiv = reader.querySelector('.document-reader-content');
            const response = await fetch(`${API_BASE_URL}/api/files/info?path=${encodeURIComponent(path)}`);
            
            if (!response.ok) {
                contentDiv.textContent = `Error loading file: ${response.statusText}`;
                return;
            }
            
            const fileData = await response.json();
            
            if (fileData.error) {
                contentDiv.textContent = `Error loading file: ${fileData.error}`;
                return;
            }
            
            // Store original content in dataset for search and widget conversion
            contentDiv.dataset.originalContent = fileData.preview || '';
            
            // For images, create an img element that scales to fit the document viewer
            if (fileData.preview_type === 'image') {
                // Create a container for the image
                const imageContainer = document.createElement('div');
                imageContainer.style.display = 'flex';
                imageContainer.style.justifyContent = 'center';
                imageContainer.style.alignItems = 'center';
                imageContainer.style.width = '100%';
                imageContainer.style.height = '100%';
                imageContainer.style.overflow = 'hidden';
                
                // Create the image element
                const img = document.createElement('img');
                img.src = `user_data/${path}`;
                img.alt = path;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
                
                // Wait for image to load to get its natural dimensions
                img.onload = () => {
                    // Calculate the optimal window size based on image dimensions
                    const padding = 40; // Account for window header and padding
                    const maxWidth = window.innerWidth * 0.8; // Max 80% of window width
                    const maxHeight = window.innerHeight * 0.8; // Max 80% of window height
                    
                    // Calculate scale factor to fit within max dimensions
                    const widthScale = maxWidth / img.naturalWidth;
                    const heightScale = maxHeight / img.naturalHeight;
                    const scale = Math.min(widthScale, heightScale);
                    
                    // Set window dimensions to match scaled image
                    const windowWidth = Math.min(img.naturalWidth * scale + padding, maxWidth);
                    const windowHeight = Math.min(img.naturalHeight * scale + padding, maxHeight);
                    
                    // Update window size
                    reader.style.width = `${windowWidth}px`;
                    reader.style.height = `${windowHeight}px`;
                    
                    // Center the window
                    const left = (window.innerWidth - windowWidth) / 2;
                    const top = (window.innerHeight - windowHeight) / 2;
                    reader.style.left = `${left}px`;
                    reader.style.top = `${top}px`;
                };
                
                imageContainer.appendChild(img);
                contentDiv.innerHTML = '';
                contentDiv.appendChild(imageContainer);
            } 
            // For text files, display content with proper formatting
            else if (fileData.preview_type === 'text') {
                // Check if content is HTML
                if (fileData.preview && /<[^>]+>/i.test(fileData.preview)) {
                    contentDiv.innerHTML = fileData.preview;
                } else {
                    contentDiv.textContent = fileData.preview || '';
                }
            } else {
                contentDiv.textContent = 'Preview not available for this file type';
            }
        } catch (error) {
            console.error("Error loading file:", error);
            contentDiv.textContent = `Error loading file: ${error.message}`;
        }
    }

    function createDocumentReader(path) {
        withWindowManager(windowManager => {
            // Check if file is already being viewed
            if (documentReaders.has(path)) {
                const existingReader = documentReaders.get(path);
                // Focus the existing window
                existingReader.focus();
                return;
            }
            
            // Create a content placeholder
            const contentDiv = document.createElement('div');
            contentDiv.className = 'document-reader-content';
            contentDiv.textContent = 'Loading...';
            
            // Create search bar
            const searchBar = document.createElement('div');
            searchBar.className = 'document-reader-search';
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search...';
            searchInput.spellcheck = false;
            searchInput.autocomplete = 'off';
            
            const searchControls = document.createElement('div');
            searchControls.className = 'search-controls';
            
            const prevButton = document.createElement('button');
            prevButton.innerHTML = '↑';
            prevButton.title = 'Previous match (Shift+Enter)';
            
            const nextButton = document.createElement('button');
            nextButton.innerHTML = '↓';
            nextButton.title = 'Next match (Enter)';
            
            const searchCount = document.createElement('span');
            searchCount.className = 'search-count';
            
            const caseSensitiveButton = document.createElement('button');
            caseSensitiveButton.innerHTML = 'Aa';
            caseSensitiveButton.title = 'Case sensitive';
            caseSensitiveButton.className = 'case-sensitive';
            
            searchControls.appendChild(caseSensitiveButton);
            searchControls.appendChild(prevButton);
            searchControls.appendChild(nextButton);
            searchControls.appendChild(searchCount);
            
            searchBar.appendChild(searchInput);
            searchBar.appendChild(searchControls);
            
            // Create the window using the window manager
            const reader = windowManager.createWindow({
                title: path.split('/').pop(),
                content: contentDiv,
                className: 'document-reader',
                onClose: () => {
                    documentReaders.delete(path);
                }
            });
            
            // Insert search bar after content
            const contentContainer = reader.querySelector('.window-manager-content');
            contentContainer.parentNode.appendChild(searchBar);
            
            // Add to tracking map with file path as key
            documentReaders.set(path, reader);
            
            // Load the file content
            loadFileContent(path, reader);
            
            // Add search functionality
            let currentMatchIndex = -1;
            let matches = [];
            let isCaseSensitive = false;
            let searchTimeout = null;
            
            function createRegex(pattern) {
                try {
                    const flags = isCaseSensitive ? 'g' : 'gi';
                    // Convert wildcards to regex pattern
                    const escapedPattern = pattern
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
                        .replace(/\*/g, '.*') // Convert * to .* for wildcard
                        .replace(/\?/g, '.'); // Convert ? to . for single char wildcard
                    return new RegExp(escapedPattern, flags);
                } catch (e) {
                    return null;
                }
            }
            
            function findMatches() {
                const searchText = searchInput.value;
                if (!searchText) {
                    matches = [];
                    currentMatchIndex = -1;
                    searchCount.textContent = '';
                    return;
                }
                
                const regex = createRegex(searchText);
                if (!regex) {
                    searchCount.textContent = 'Invalid regex';
                    return;
                }
                
                // Get the original text content
                const originalText = contentDiv.dataset.originalContent || '';
                
                // Find all matches in the original text
                matches = [];
                let match;
                while ((match = regex.exec(originalText)) !== null) {
                    matches.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        text: match[0]
                    });
                }
                
                // Update count
                searchCount.textContent = matches.length ? `${currentMatchIndex + 1}/${matches.length}` : '0/0';
            }
            
            function highlightMatches() {
                // Get the original content
                const originalContent = contentDiv.dataset.originalContent || '';
                
                // Create a temporary container to hold the highlighted content
                const tempContainer = document.createElement('div');
                
                // Check if content is HTML
                const isHTML = /<[^>]+>/i.test(originalContent);
                
                if (isHTML) {
                    // For HTML content, preserve the structure
                    tempContainer.innerHTML = originalContent;
                    
                    // Get all text nodes in the document
                    const walker = document.createTreeWalker(
                        tempContainer,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let node;
                    const textNodes = [];
                    while (node = walker.nextNode()) {
                        textNodes.push(node);
                    }
                    
                    // Process each text node
                    for (const textNode of textNodes) {
                        const text = textNode.textContent;
                        let lastIndex = 0;
                        let newContent = document.createDocumentFragment();
                        
                        // Sort matches by start position to handle overlapping matches
                        const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
                        
                        for (const match of sortedMatches) {
                            // Add text before the match
                            if (match.start > lastIndex) {
                                newContent.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
                            }
                            
                            // Add the highlighted match
                            const highlight = document.createElement('span');
                            highlight.className = `search-highlight ${match === matches[currentMatchIndex] ? 'active' : ''}`;
                            highlight.textContent = match.text;
                            newContent.appendChild(highlight);
                            
                            lastIndex = match.end;
                        }
                        
                        // Add remaining text
                        if (lastIndex < text.length) {
                            newContent.appendChild(document.createTextNode(text.slice(lastIndex)));
                        }
                        
                        // Replace the text node with the new content
                        textNode.parentNode.replaceChild(newContent, textNode);
                    }
                    
                    // Update the content
                    contentDiv.innerHTML = tempContainer.innerHTML;
                } else {
                    // For plain text content, use the existing highlighting logic
                    let lastIndex = 0;
                    let offset = 0;
                    
                    // Sort matches by start position to handle overlapping matches
                    const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
                    
                    // Add text chunks and highlights
                    for (const match of sortedMatches) {
                        // Add text before the match
                        if (match.start > lastIndex) {
                            const beforeText = originalContent.slice(lastIndex, match.start);
                            tempContainer.appendChild(document.createTextNode(beforeText));
                        }
                        
                        // Add the highlighted match
                        const highlight = document.createElement('span');
                        highlight.className = `search-highlight ${match === matches[currentMatchIndex] ? 'active' : ''}`;
                        highlight.textContent = match.text;
                        tempContainer.appendChild(highlight);
                        
                        lastIndex = match.end;
                    }
                    
                    // Add remaining text
                    if (lastIndex < originalContent.length) {
                        tempContainer.appendChild(document.createTextNode(originalContent.slice(lastIndex)));
                    }
                    
                    // Convert newlines to <br> tags while preserving the structure
                    const finalContent = tempContainer.innerHTML.replace(/\n/g, '<br>');
                    contentDiv.innerHTML = finalContent;
                }
                
                // Scroll to active match if exists
                if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
                    const activeHighlight = contentDiv.querySelector('.search-highlight.active');
                    if (activeHighlight) {
                        activeHighlight.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }
            }
            
            function updateSearch() {
                // Clear previous timeout
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                // Debounce search to improve performance
                searchTimeout = setTimeout(() => {
                    findMatches();
                    highlightMatches();
                }, 100);
            }
            
            function navigateMatch(direction) {
                if (!matches.length) return;
                
                currentMatchIndex = (currentMatchIndex + direction + matches.length) % matches.length;
                highlightMatches();
            }
            
            // Add event listeners
            searchInput.addEventListener('input', () => {
                currentMatchIndex = 0;
                updateSearch();
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        navigateMatch(-1);
                    } else {
                        navigateMatch(1);
                    }
                }
            });
            
            prevButton.addEventListener('click', () => navigateMatch(-1));
            nextButton.addEventListener('click', () => navigateMatch(1));
            
            caseSensitiveButton.addEventListener('click', () => {
                isCaseSensitive = !isCaseSensitive;
                caseSensitiveButton.classList.toggle('active', isCaseSensitive);
                currentMatchIndex = 0;
                updateSearch();
            });
        });
    }

    // Model Configuration
    async function fetchModels() {
        if (cachedModels) {
            return cachedModels;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/models`);
            const data = await response.json();
            cachedModels = data.models || [];
            return cachedModels;
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    }

    async function getCurrentModel() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/model`);
            const data = await response.json();
            // Save to localStorage
            localStorage.setItem('currentModel', JSON.stringify(data));
            return data;
        } catch (error) {
            console.error('Error fetching current model:', error);
            // Try to get from localStorage if API fails
            const savedModel = localStorage.getItem('currentModel');
            return savedModel ? JSON.parse(savedModel) : null;
        }
    }

    async function getContextLength() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/context_length`);
            const data = await response.json();
            // Save to localStorage
            localStorage.setItem('contextLength', data.context_length);
            return data.context_length;
        } catch (error) {
            console.error('Error fetching context length:', error);
            // Try to get from localStorage if API fails
            const savedLength = localStorage.getItem('contextLength');
            return savedLength ? parseInt(savedLength) : null;
        }
    }

    async function setContextLength(length) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/context_length`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ context_length: length })
            });
            const data = await response.json();
            if (data.success) {
                // Save to localStorage
                localStorage.setItem('contextLength', length);
                showNotification(`Context length updated to ${length} tokens`, 3000);
            } else {
                showNotification(`Failed to update context length: ${data.error}`, 3000, true);
            }
            return data;
        } catch (error) {
            console.error('Error setting context length:', error);
            showNotification('Failed to update context length', 3000, true);
            return null;
        }
    }

    async function switchModel(model, baseUrl, apiKey) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/switch_model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    base_url: baseUrl,
                    api_key: apiKey
                })
            });
            const data = await response.json();
            if (data.success) {
                // Save to localStorage
                localStorage.setItem('modelSettings', JSON.stringify({
                    model,
                    baseUrl,
                    apiKey
                }));
                showNotification(`Switched to model: ${model}`, 3000);
                // Clear the model cache when switching models
                cachedModels = null;
            } else {
                showNotification(`Failed to switch model: ${data.error}`, 3000, true);
            }
            return data;
        } catch (error) {
            console.error('Error switching model:', error);
            showNotification('Failed to switch model', 3000, true);
            return null;
        }
    }

    function createModelConfigWindow() {
        const content = `
            <div class="model-config-form">
                <div class="form-group">
                    <label for="model-select">Select Model:</label>
                    <select id="model-select" class="form-control">
                        <option value="">Loading models...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="context-length">Context Length (tokens):</label>
                    <input type="number" id="context-length" class="form-control" min="1" step="1">
                </div>
                <div class="form-divider"></div>
                <div class="form-group">
                    <label for="base-url">Base URL (optional):</label>
                    <input type="text" id="base-url" class="form-control" placeholder="https://api.example.com">
                </div>
                <div class="form-group">
                    <label for="api-key">API Key (optional):</label>
                    <input type="password" id="api-key" class="form-control" placeholder="Enter your API key">
                </div>
                <div class="form-actions">
                    <button id="save-model-config" class="button">Save Configuration</button>
                </div>
            </div>
        `;

        const configWindow = window.windowManager.createWindow({
            title: 'Model Configuration',
            content: content,
            width: 500,
            height: 500,
            minWidth: 400,
            minHeight: 400,
            resizable: true,
            maximizable: true,
            minimizable: true,
            onClose: () => {
                // Clean up any event listeners or state
                const saveButton = configWindow.querySelector('#save-model-config');
                if (saveButton) {
                    saveButton.removeEventListener('click', saveConfig);
                }
            }
        });

        // Initialize the form
        const modelSelect = configWindow.querySelector('#model-select');
        const contextLengthInput = configWindow.querySelector('#context-length');
        const baseUrlInput = configWindow.querySelector('#base-url');
        const apiKeyInput = configWindow.querySelector('#api-key');
        const saveButton = configWindow.querySelector('#save-model-config');

        // Load current settings
        Promise.all([
            getCurrentModel(),
            getContextLength(),
            fetchModels()
        ]).then(([currentModel, currentContextLength, models]) => {
            // Set up model select
            modelSelect.innerHTML = '';
            let currentModelName = '';
            
            if (currentModel) {
                currentModelName = `${currentModel.provider}:${currentModel.model}`;
            }
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                if (model === currentModelName) {
                    option.selected = true;
                }
                modelSelect.appendChild(option);
            });

            // Set context length
            if (currentContextLength) {
                contextLengthInput.value = currentContextLength;
            }

            // Load saved settings from localStorage
            const savedSettings = localStorage.getItem('modelSettings');
            if (savedSettings) {
                const { baseUrl, apiKey } = JSON.parse(savedSettings);
                baseUrlInput.value = baseUrl || '';
                apiKeyInput.value = apiKey || '';
            }
        }).catch(error => {
            console.error('Error loading model configuration:', error);
            showNotification('Failed to load model configuration', 3000, true);
        });

        // Save configuration
        const saveConfig = async () => {
            const model = modelSelect.value;
            const contextLength = parseInt(contextLengthInput.value);
            const baseUrl = baseUrlInput.value;
            const apiKey = apiKeyInput.value;

            if (!model) {
                showNotification('Please select a model', 3000, true);
                return;
            }

            if (!contextLength || contextLength < 1) {
                showNotification('Please enter a valid context length', 3000, true);
                return;
            }

            try {
                await Promise.all([
                    switchModel(model, baseUrl, apiKey),
                    setContextLength(contextLength)
                ]);
                window.windowManager.closeWindow(configWindow);
            } catch (error) {
                console.error('Error saving configuration:', error);
                showNotification('Failed to save configuration', 3000, true);
            }
        };

        saveButton.addEventListener('click', saveConfig);

        return configWindow;
    }

    // Add click handler for config button
    modelConfigButton.addEventListener('click', () => {
        // Check if a model config window is already open
        const existingWindows = window.windowManager.findWindowsByTitle('Model Configuration');
        if (existingWindows.length > 0) {
            // Focus the existing window instead of creating a new one
            window.windowManager.focusWindow(existingWindows[0]);
            return;
        }
        
        createModelConfigWindow();
    });

    // Initialize model settings from localStorage on page load
    document.addEventListener('DOMContentLoaded', async () => {
        // Load saved model settings
        const savedSettings = localStorage.getItem('modelSettings');
        if (savedSettings) {
            const { model, baseUrl, apiKey } = JSON.parse(savedSettings);
            try {
                await switchModel(model, baseUrl, apiKey);
            } catch (error) {
                console.error('Error applying saved model settings:', error);
            }
        }

        // Load saved context length
        const savedContextLength = localStorage.getItem('contextLength');
        if (savedContextLength) {
            try {
                await setContextLength(parseInt(savedContextLength));
            } catch (error) {
                console.error('Error applying saved context length:', error);
            }
        }

        // Initialize other app components
        initTextarea();
        initializeFeatures();
        initResizableColumns();
        initPreviewResize();
        initializeFileUpload();
    });

    // Make showNotification globally available
    window.showNotification = showNotification;

    function makeWidgetDraggable(widget) {
        const titleBar = widget.querySelector('.widget-title');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let originalWindow = null;

        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.widget-actions')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = widget.offsetLeft;
            startTop = widget.offsetTop;
            
            // Store reference to original window if this was converted from a window
            originalWindow = widget.dataset.originalWindowId ? 
                document.getElementById(widget.dataset.originalWindowId) : null;
            
            widget.style.zIndex = getHighestZIndex() + 1;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // If dragged far enough from the right column, restore to window
            if (originalWindow && Math.abs(dx) > 100) {
                isDragging = false;
                restoreWidgetToWindow(widget, originalWindow);
                return;
            }
            
            widget.style.left = `${startLeft + dx}px`;
            widget.style.top = `${startTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            
            // Snap to right column if close enough
            const rightColumn = document.querySelector('.right-column');
            const widgetRect = widget.getBoundingClientRect();
            const columnRect = rightColumn.getBoundingClientRect();
            
            if (Math.abs(widgetRect.right - columnRect.left) < 50) {
                snapWidgetToColumn(widget, rightColumn);
            }
        });
    }

    function restoreWidgetToWindow(widget, originalWindow) {
        if (!originalWindow) return;
        
        // Restore window position and size
        originalWindow.style.display = 'block';
        originalWindow.style.left = widget.style.left;
        originalWindow.style.top = widget.style.top;
        originalWindow.style.width = widget.style.width;
        originalWindow.style.height = widget.style.height;
        
        // Remove widget
        widget.remove();
        
        // Focus the restored window
        originalWindow.focus();
    }

    function snapWidgetToColumn(widget, column) {
        const widgets = column.querySelectorAll('.widget');
        const columnRect = column.getBoundingClientRect();
        const widgetHeight = widget.offsetHeight;
        const padding = 10;
        
        // Calculate total height of existing widgets
        let totalHeight = 0;
        widgets.forEach(w => {
            if (w !== widget) {
                totalHeight += w.offsetHeight + padding;
            }
        });
        
        // Position the widget
        widget.style.position = 'relative';
        widget.style.left = '0';
        widget.style.top = `${totalHeight}px`;
        widget.style.width = '100%';
        widget.style.marginBottom = `${padding}px`;
        
        // Ensure widget is visible in column
        const widgetBottom = totalHeight + widgetHeight;
        if (widgetBottom > columnRect.height) {
            column.scrollTop = widgetBottom - columnRect.height;
        }
    }

    function arrangeWidgets(column) {
        const widgets = column.querySelectorAll('.widget');
        const padding = 10;
        let totalHeight = 0;
        
        widgets.forEach(widget => {
            widget.style.position = 'relative';
            widget.style.left = '0';
            widget.style.top = `${totalHeight}px`;
            widget.style.width = '100%';
            widget.style.marginBottom = `${padding}px`;
            totalHeight += widget.offsetHeight + padding;
        });
        
        // Adjust column scroll if needed
        const columnRect = column.getBoundingClientRect();
        if (totalHeight > columnRect.height) {
            column.scrollTop = totalHeight - columnRect.height;
        }
    }

    function handleWidgetDrop(e) {
        e.preventDefault();
        const widget = document.querySelector('.dragging');
        if (!widget) return;
        
        const column = e.target.closest('.column');
        if (!column) return;
        
        // Remove from old column if exists
        const oldColumn = widget.parentElement;
        if (oldColumn && oldColumn.classList.contains('column')) {
            oldColumn.removeChild(widget);
        }
        
        // Add to new column
        column.appendChild(widget);
        widget.classList.remove('dragging');
        
        // Snap to column
        snapWidgetToColumn(widget, column);
        
        // Rearrange all widgets in the column
        arrangeWidgets(column);
    }
}); 
