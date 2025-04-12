/**
 * Window Manager
 * 
 * A reusable module for creating and managing windows in the application.
 * Provides functionality for creating, positioning, resizing, focusing, and closing windows.
 */

class WindowManager {
    constructor() {
        // Track all open windows
        this.windows = new Set();
        this.activeZIndex = 1000;
        
        // Keep track of global event listeners to avoid duplicating them
        this._eventListenersInitialized = false;
        
        // Window registry for finding windows by ID or other criteria
        this.windowRegistry = new Map();
        
        // Minimized windows container
        this.minimizedWindows = new Map();
        this.minimizedBar = null;
        
        // State for dragging optimization
        this.dragWindow = null;
        this.resizeWindow = null;
        this.animationFrameId = null;
        
        // Mouse detection for minimized bar
        this.mouseDetectionActive = false;
        this.mouseDetectionThreshold = 20; // px from bottom
        
        // Initialize the global event listeners
        this._initGlobalEventListeners();
        
        // Create minimized window bar
        this._createMinimizedBar();
    }
    
    /**
     * Initialize global event listeners for window interactions
     * @private
     */
    _initGlobalEventListeners() {
        if (this._eventListenersInitialized) return;
        
        // Event handler for mouse move (used by drag and resize)
        document.addEventListener('mousemove', this._handleMouseMove.bind(this));
        
        // Event handler for mouse up (used by drag and resize)
        document.addEventListener('mouseup', this._handleMouseUp.bind(this));
        
        // Handle window resize event
        window.addEventListener('resize', this._handleWindowResize.bind(this));
        
        // Handle mouse detection for minimized bar
        document.addEventListener('mousemove', this._handleMouseDetection.bind(this));
        
        this._eventListenersInitialized = true;
    }
    
    /**
     * Handle mouse detection for minimized bar
     * @private
     * @param {MouseEvent} e - Mouse event
     */
    _handleMouseDetection(e) {
        if (!this.minimizedBar || this.minimizedBar.style.display === 'none') return;
        
        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;
        
        // Check if mouse is near the bottom of the viewport
        if (mouseY >= viewportHeight - this.mouseDetectionThreshold) {
            this.minimizedBar.classList.add('reveal');
        } else {
            this.minimizedBar.classList.remove('reveal');
        }
    }
    
    /**
     * Create minimized window bar at the bottom of the screen
     * @private
     */
    _createMinimizedBar() {
        // Check if minimized bar already exists
        if (this.minimizedBar) return;
        
        // Create minimized bar container
        const minimizedBar = document.createElement('div');
        minimizedBar.className = 'window-manager-minimized-bar';
        minimizedBar.style.display = 'none'; // Hide initially until windows are minimized
        
        document.body.appendChild(minimizedBar);
        
        this.minimizedBar = minimizedBar;
    }
    
    /**
     * Handle browser window resize
     * @private
     */
    _handleWindowResize() {
        // Ensure windows stay within the viewport when browser is resized
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        this.windows.forEach(windowEl => {
            // Get current position and size
            const rect = windowEl.getBoundingClientRect();
            
            // Check if window is partially outside the viewport
            if (rect.right > windowWidth) {
                windowEl.style.left = `${Math.max(0, windowWidth - rect.width)}px`;
            }
            
            if (rect.bottom > windowHeight) {
                windowEl.style.top = `${Math.max(0, windowHeight - rect.height)}px`;
            }
        });
    }
    
    /**
     * Generate a unique window ID
     * @private
     * @returns {string} - Unique window ID
     */
    _generateWindowId() {
        return `window-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }
    
    /**
     * Create a new window
     * @param {Object} options - Configuration for the new window
     * @param {string} options.title - Window title
     * @param {string|HTMLElement} options.content - Content for the window (HTML string or element)
     * @param {number} [options.width=800] - Initial width of the window in pixels
     * @param {number} [options.height=600] - Initial height of the window in pixels
     * @param {number} [options.left] - Initial left position of the window in pixels
     * @param {number} [options.top] - Initial top position of the window in pixels
     * @param {number} [options.minWidth=400] - Minimum width of the window in pixels
     * @param {number} [options.minHeight=300] - Minimum height of the window in pixels
     * @param {boolean} [options.resizable=true] - Whether the window is resizable
     * @param {boolean} [options.maximizable=true] - Whether the window can be maximized
     * @param {boolean} [options.minimizable=true] - Whether the window can be minimized
     * @param {string} [options.className] - Additional CSS class for the window
     * @param {string} [options.id] - Window ID, generated if not provided
     * @param {Function} [options.onClose] - Callback function when window is closed
     * @param {Function} [options.onFocus] - Callback function when window is focused
     * @param {Function} [options.onBlur] - Callback function when window loses focus
     * @param {Function} [options.onResize] - Callback function when window is resized
     * @param {Function} [options.onMove] - Callback function when window is moved
     * @returns {HTMLElement} - The created window element
     */
    createWindow(options) {
        const {
            title,
            content,
            width = 800,
            height = 600,
            left,
            top,
            minWidth = 400,
            minHeight = 300,
            resizable = true,
            maximizable = true,
            minimizable = true,
            className = '',
            id = this._generateWindowId(),
            onClose = null,
            onFocus = null,
            onBlur = null,
            onResize = null,
            onMove = null
        } = options;
        
        // Create the window container
        const windowEl = document.createElement('div');
        windowEl.className = `window-manager-window ${className}`;
        windowEl.setAttribute('data-window-id', id);
        windowEl.style.zIndex = this.activeZIndex++;
        
        // Set window data for internal tracking
        windowEl._windowManager = {
            id,
            title,
            isDragging: false,
            isResizing: false,
            isMaximized: false,
            isMinimized: false,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            startWidth: 0,
            startHeight: 0,
            lastPosition: { left: null, top: null },
            lastSize: { width: null, height: null },
            onClose,
            onFocus,
            onBlur,
            onResize,
            onMove
        };
        
        // Set initial position and size
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const calculatedWidth = Math.min(width, windowWidth - 100);
        const calculatedHeight = Math.min(height, windowHeight - 100);
        const calculatedLeft = left !== undefined ? left : (windowWidth - calculatedWidth) / 2;
        const calculatedTop = top !== undefined ? top : (windowHeight - calculatedHeight) / 2;
        
        windowEl.style.width = `${calculatedWidth}px`;
        windowEl.style.height = `${calculatedHeight}px`;
        windowEl.style.left = `${calculatedLeft}px`;
        windowEl.style.top = `${calculatedTop}px`;
        windowEl.style.minWidth = `${minWidth}px`;
        windowEl.style.minHeight = `${minHeight}px`;
        
        // Set will-change property to optimize for hardware acceleration
        // But only set it when needed (during dragging/resizing) to avoid excessive memory use
        windowEl.style.willChange = 'transform'; // Optimize for animations/transforms
        windowEl.style.backfaceVisibility = 'hidden'; // Further optimization
        
        // Save last position and size
        windowEl._windowManager.lastPosition = { 
            left: calculatedLeft, 
            top: calculatedTop 
        };
        windowEl._windowManager.lastSize = { 
            width: calculatedWidth, 
            height: calculatedHeight 
        };
        
        // Create header
        const header = document.createElement('div');
        header.className = 'window-manager-header';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'window-manager-title';
        titleEl.textContent = title;
        
        const controls = document.createElement('div');
        controls.className = 'window-manager-controls';
        
        // Create window control buttons if enabled
        if (minimizable) {
            const minimizeButton = document.createElement('button');
            minimizeButton.className = 'window-manager-button minimize';
            minimizeButton.innerHTML = '&#8211;';
            minimizeButton.title = 'Minimize';
            minimizeButton.addEventListener('click', () => this.minimizeWindow(windowEl));
            controls.appendChild(minimizeButton);
        }
        
        if (maximizable) {
            const maximizeButton = document.createElement('button');
            maximizeButton.className = 'window-manager-button maximize';
            maximizeButton.innerHTML = '&#9744;';
            maximizeButton.title = 'Maximize';
            maximizeButton.addEventListener('click', () => this.toggleMaximize(windowEl));
            controls.appendChild(maximizeButton);
        }
        
        const closeButton = document.createElement('button');
        closeButton.className = 'window-manager-button close';
        closeButton.innerHTML = '×';
        closeButton.title = 'Close';
        
        controls.appendChild(closeButton);
        header.appendChild(titleEl);
        header.appendChild(controls);
        
        // Create content area
        const contentContainer = document.createElement('div');
        contentContainer.className = 'window-manager-content';
        
        if (typeof content === 'string') {
            contentContainer.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            contentContainer.appendChild(content);
        }
        
        // Create resize handle if the window is resizable
        if (resizable) {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'window-manager-resize-handle';
            windowEl.appendChild(resizeHandle);
            
            // Add resize event listeners
            resizeHandle.addEventListener('mousedown', (e) => this._startResizing(e, windowEl));
        }
        
        // Assemble the window
        windowEl.appendChild(header);
        windowEl.appendChild(contentContainer);
        document.body.appendChild(windowEl);
        
        // Add to tracking set and registry
        this.windows.add(windowEl);
        this.windowRegistry.set(id, windowEl);
        
        // Add event listeners
        header.addEventListener('mousedown', (e) => this._startDragging(e, windowEl));
        closeButton.addEventListener('click', () => this.closeWindow(windowEl));
        windowEl.addEventListener('mousedown', () => this.focusWindow(windowEl));
        
        // Double-click header to toggle maximize
        if (maximizable) {
            header.addEventListener('dblclick', () => this.toggleMaximize(windowEl));
        }
        
        // Return the created window
        return windowEl;
    }
    
    /**
     * Close a window
     * @param {HTMLElement} windowEl - The window element to close
     */
    closeWindow(windowEl) {
        if (!this.windows.has(windowEl)) return;
        
        // Call the onClose callback if provided
        if (windowEl._windowManager && typeof windowEl._windowManager.onClose === 'function') {
            windowEl._windowManager.onClose();
        }
        
        // Remove from minimized windows if it was minimized
        if (windowEl._windowManager.isMinimized && windowEl._windowManager.id) {
            this._removeMinimizedWindow(windowEl._windowManager.id);
        }
        
        // Remove from tracking set, registry, and DOM
        this.windows.delete(windowEl);
        if (windowEl._windowManager && windowEl._windowManager.id) {
            this.windowRegistry.delete(windowEl._windowManager.id);
        }
        windowEl.remove();
        
        // Cancel any pending animation frames for this window
        if (this.dragWindow === windowEl || this.resizeWindow === windowEl) {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.dragWindow = null;
            this.resizeWindow = null;
        }
    }
    
    /**
     * Close all windows
     */
    closeAllWindows() {
        this.windows.forEach(window => this.closeWindow(window));
    }
    
    /**
     * Maximize a window to fill the viewport
     * @param {HTMLElement} windowEl - The window to maximize
     */
    maximizeWindow(windowEl) {
        if (!this.windows.has(windowEl) || windowEl._windowManager.isMaximized) return;
        
        // Save current position and size before maximizing
        const rect = windowEl.getBoundingClientRect();
        windowEl._windowManager.lastPosition = { 
            left: rect.left, 
            top: rect.top 
        };
        windowEl._windowManager.lastSize = { 
            width: rect.width, 
            height: rect.height 
        };
        
        // Maximize the window
        windowEl.style.left = '0';
        windowEl.style.top = '0';
        windowEl.style.width = '100vw';
        windowEl.style.height = '100vh';
        windowEl._windowManager.isMaximized = true;
        
        // Set data attribute for CSS styling
        windowEl.setAttribute('data-maximized', 'true');
        
        // Update button icon
        const maximizeButton = windowEl.querySelector('.window-manager-button.maximize');
        if (maximizeButton) {
            maximizeButton.innerHTML = '&#9783;';
            maximizeButton.title = 'Restore';
        }
        
        // Focus the window
        this.focusWindow(windowEl);
        
        // Call onResize callback if provided
        if (typeof windowEl._windowManager.onResize === 'function') {
            windowEl._windowManager.onResize(windowEl);
        }
    }
    
    /**
     * Restore a window to its position before maximizing
     * @param {HTMLElement} windowEl - The window to restore
     */
    restoreWindow(windowEl) {
        if (!this.windows.has(windowEl)) return;
        
        if (windowEl._windowManager.isMaximized) {
            // Restore from maximized state
            const { lastPosition, lastSize } = windowEl._windowManager;
            
            // Only restore if we have valid last position/size
            if (lastPosition.left !== null && lastSize.width !== null) {
                windowEl.style.left = `${lastPosition.left}px`;
                windowEl.style.top = `${lastPosition.top}px`;
                windowEl.style.width = `${lastSize.width}px`;
                windowEl.style.height = `${lastSize.height}px`;
            }
            
            windowEl._windowManager.isMaximized = false;
            
            // Remove data attribute for CSS styling
            windowEl.removeAttribute('data-maximized');
            
            // Update button icon
            const maximizeButton = windowEl.querySelector('.window-manager-button.maximize');
            if (maximizeButton) {
                maximizeButton.innerHTML = '&#9744;';
                maximizeButton.title = 'Maximize';
            }
            
            // Call onResize callback if provided
            if (typeof windowEl._windowManager.onResize === 'function') {
                windowEl._windowManager.onResize(windowEl);
            }
        }
        
        if (windowEl._windowManager.isMinimized) {
            // Remove from minimized bar
            this._removeMinimizedWindow(windowEl._windowManager.id);
            
            // Show the window
            windowEl.style.display = 'flex';
            windowEl._windowManager.isMinimized = false;
        }
        
        // Focus the window
        this.focusWindow(windowEl);
    }
    
    /**
     * Toggle between maximized and restored states
     * @param {HTMLElement} windowEl - The window to toggle
     */
    toggleMaximize(windowEl) {
        if (!this.windows.has(windowEl)) return;
        
        if (windowEl._windowManager.isMaximized) {
            this.restoreWindow(windowEl);
        } else {
            this.maximizeWindow(windowEl);
        }
    }
    
    /**
     * Add a window to the minimized bar
     * @private
     * @param {HTMLElement} windowEl - The window to minimize
     */
    _addToMinimizedBar(windowEl) {
        if (!windowEl._windowManager.id) return;
        
        // Create minimized window item
        const minimizedItem = document.createElement('div');
        minimizedItem.className = 'window-manager-minimized-item';
        minimizedItem.setAttribute('data-window-id', windowEl._windowManager.id);
        
        // Create title with icon
        const itemContent = document.createElement('div');
        itemContent.className = 'window-manager-minimized-title';
        itemContent.textContent = windowEl._windowManager.title || 'Window';
        
        // Add restore functionality
        minimizedItem.addEventListener('click', () => {
            this.restoreWindow(windowEl);
        });
        
        minimizedItem.appendChild(itemContent);
        this.minimizedBar.appendChild(minimizedItem);
        
        // Store in minimized windows map
        this.minimizedWindows.set(windowEl._windowManager.id, {
            window: windowEl,
            element: minimizedItem
        });
        
        // Show the minimized bar with animation
        this.minimizedBar.style.display = 'flex';
        this.minimizedBar.classList.add('reveal');
        this.minimizedBar.classList.add('first-minimize');
        
        // Animate minimizing after a delay to show the user where the window went
        setTimeout(() => {
            // Add a transition class to animate the transition
            this.minimizedBar.classList.add('animated');
            // Remove the reveal class to let it slide down
            this.minimizedBar.classList.remove('reveal');
            
            // Clean up animation classes after transition completes
            setTimeout(() => {
                this.minimizedBar.classList.remove('first-minimize');
                this.minimizedBar.classList.remove('animated');
            }, 1000); // Increased from 500ms to 1000ms for slower animation
        }, 2500); // Increased from 1500ms to 2500ms to show longer before sliding down
    }
    
    /**
     * Remove a window from the minimized bar
     * @private
     * @param {string} windowId - The ID of the window to remove
     */
    _removeMinimizedWindow(windowId) {
        if (!this.minimizedWindows.has(windowId)) return;
        
        // Get minimized item
        const { element } = this.minimizedWindows.get(windowId);
        
        // Remove from DOM
        if (element && element.parentNode) {
            element.remove();
        }
        
        // Remove from map
        this.minimizedWindows.delete(windowId);
        
        // Hide the minimized bar if empty
        if (this.minimizedWindows.size === 0) {
            this.minimizedBar.style.display = 'none';
            this.minimizedBar.classList.remove('reveal');
        }
    }
    
    /**
     * Minimize a window (add to minimized bar and hide)
     * @param {HTMLElement} windowEl - The window to minimize
     */
    minimizeWindow(windowEl) {
        if (!this.windows.has(windowEl) || windowEl._windowManager.isMinimized) return;
        
        // Add to minimized bar
        this._addToMinimizedBar(windowEl);
        
        // Hide the window but keep it in our tracking sets
        windowEl.style.display = 'none';
        windowEl._windowManager.isMinimized = true;
    }
    
    /**
     * Set window content
     * @param {HTMLElement} windowEl - The window element
     * @param {string|HTMLElement} content - Content for the window (HTML string or element)
     */
    setWindowContent(windowEl, content) {
        if (!this.windows.has(windowEl)) return;
        
        const contentContainer = windowEl.querySelector('.window-manager-content');
        if (!contentContainer) return;
        
        // Clear existing content
        contentContainer.innerHTML = '';
        
        // Set new content
        if (typeof content === 'string') {
            contentContainer.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            contentContainer.appendChild(content);
        }
    }
    
    /**
     * Set window title
     * @param {HTMLElement} windowEl - The window element
     * @param {string} title - New window title
     */
    setWindowTitle(windowEl, title) {
        if (!this.windows.has(windowEl)) return;
        
        const titleEl = windowEl.querySelector('.window-manager-title');
        if (titleEl) {
            titleEl.textContent = title;
            
            // Update title in window manager data
            if (windowEl._windowManager) {
                windowEl._windowManager.title = title;
                
                // Update minimized window title if minimized
                if (windowEl._windowManager.isMinimized && windowEl._windowManager.id) {
                    const minimizedData = this.minimizedWindows.get(windowEl._windowManager.id);
                    if (minimizedData && minimizedData.element) {
                        const titleEl = minimizedData.element.querySelector('.window-manager-minimized-title');
                        if (titleEl) {
                            titleEl.textContent = title;
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Focus a window (bring to front)
     * @param {HTMLElement} windowEl - The window element to focus
     */
    focusWindow(windowEl) {
        if (!this.windows.has(windowEl)) return;
        
        // Call onBlur for previously focused windows
        this.windows.forEach(win => {
            if (win !== windowEl && win.style.zIndex === String(this.activeZIndex - 1)) {
                if (typeof win._windowManager.onBlur === 'function') {
                    win._windowManager.onBlur(win);
                }
            }
        });
        
        // Bring window to front
        windowEl.style.zIndex = this.activeZIndex++;
        
        // Call onFocus callback if provided
        if (typeof windowEl._windowManager.onFocus === 'function') {
            windowEl._windowManager.onFocus(windowEl);
        }
    }
    
    /**
     * Find a window by its ID
     * @param {string} id - Window ID
     * @returns {HTMLElement|null} - The window element or null if not found
     */
    findWindowById(id) {
        return this.windowRegistry.get(id) || null;
    }
    
    /**
     * Find windows by title (case-insensitive partial match)
     * @param {string} title - Title to search for
     * @returns {HTMLElement[]} - Array of matching window elements
     */
    findWindowsByTitle(title) {
        const result = [];
        const searchTitle = title.toLowerCase();
        
        this.windows.forEach(windowEl => {
            if (windowEl._windowManager && 
                windowEl._windowManager.title && 
                windowEl._windowManager.title.toLowerCase().includes(searchTitle)) {
                result.push(windowEl);
            }
        });
        
        return result;
    }
    
    /**
     * Get all windows
     * @returns {HTMLElement[]} - Array of all window elements
     */
    getAllWindows() {
        return Array.from(this.windows);
    }
    
    /**
     * Start window dragging
     * @private
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} windowEl - The window element being dragged
     */
    _startDragging(e, windowEl) {
        if (e.button !== 0) return; // Only left click
        
        // Can't drag maximized windows
        if (windowEl._windowManager.isMaximized) return;
        
        this.focusWindow(windowEl);
        
        // Set dragging state
        windowEl._windowManager.isDragging = true;
        windowEl._windowManager.startX = e.clientX;
        windowEl._windowManager.startY = e.clientY;
        windowEl._windowManager.startLeft = parseInt(windowEl.style.left);
        windowEl._windowManager.startTop = parseInt(windowEl.style.top);
        
        // Optimize for hardware acceleration during dragging
        windowEl.style.willChange = 'transform, left, top';
        
        // Set as current drag window
        this.dragWindow = windowEl;
        
        // Prevent text selection during drag
        e.preventDefault();
    }
    
    /**
     * Start window resizing
     * @private
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} windowEl - The window element being resized
     */
    _startResizing(e, windowEl) {
        if (e.button !== 0) return; // Only left click
        
        // Can't resize maximized windows
        if (windowEl._windowManager.isMaximized) return;
        
        this.focusWindow(windowEl);
        
        // Set resizing state
        windowEl._windowManager.isResizing = true;
        windowEl._windowManager.startX = e.clientX;
        windowEl._windowManager.startY = e.clientY;
        windowEl._windowManager.startWidth = parseInt(windowEl.style.width);
        windowEl._windowManager.startHeight = parseInt(windowEl.style.height);
        
        // Add resizing class to apply transitions only during resize
        windowEl.classList.add('resizing');
        
        // Optimize for hardware acceleration during resizing
        windowEl.style.willChange = 'width, height';
        
        // Set as current resize window
        this.resizeWindow = windowEl;
        
        // Prevent text selection during resize
        e.preventDefault();
    }
    
    /**
     * Handle mouse move for dragging and resizing
     * @private
     * @param {MouseEvent} e - Mouse event
     */
    _handleMouseMove(e) {
        // If we have a dragging or resizing window, use requestAnimationFrame
        if (this.dragWindow || this.resizeWindow) {
            // Store event data for use in animation frame
            const eventData = {
                clientX: e.clientX,
                clientY: e.clientY
            };
            
            // Cancel any existing animation frame
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            
            // Schedule a new animation frame
            this.animationFrameId = requestAnimationFrame(() => {
                this._processMouseMove(eventData);
            });
        }
    }
    
    /**
     * Process mouse move in animation frame for smoother performance
     * @private
     * @param {Object} e - Event data with clientX and clientY
     */
    _processMouseMove(e) {
        // Process dragging
        if (this.dragWindow) {
            const windowEl = this.dragWindow;
            
            // Handle dragging using transform for better performance
            const dx = e.clientX - windowEl._windowManager.startX;
            const dy = e.clientY - windowEl._windowManager.startY;
            
            const newLeft = windowEl._windowManager.startLeft + dx;
            const newTop = windowEl._windowManager.startTop + dy;
            
            // Use direct style updates for better performance
            // Avoid using transform to prevent layer compositing issues during dragging
            windowEl.style.left = `${newLeft}px`;
            windowEl.style.top = `${newTop}px`;
            
            // Call onMove callback if provided
            if (typeof windowEl._windowManager.onMove === 'function') {
                windowEl._windowManager.onMove(windowEl);
            }
        }
        
        // Process resizing
        if (this.resizeWindow) {
            const windowEl = this.resizeWindow;
            
            const dx = e.clientX - windowEl._windowManager.startX;
            const dy = e.clientY - windowEl._windowManager.startY;
            
            const minWidth = parseInt(windowEl.style.minWidth) || 400;
            const minHeight = parseInt(windowEl.style.minHeight) || 300;
            
            const newWidth = Math.max(minWidth, windowEl._windowManager.startWidth + dx);
            const newHeight = Math.max(minHeight, windowEl._windowManager.startHeight + dy);
            
            windowEl.style.width = `${newWidth}px`;
            windowEl.style.height = `${newHeight}px`;
            
            // Call onResize callback if provided
            if (typeof windowEl._windowManager.onResize === 'function') {
                windowEl._windowManager.onResize(windowEl);
            }
        }
    }
    
    /**
     * Handle mouse up for dragging and resizing
     * @private
     * @param {MouseEvent} e - Mouse event
     */
    _handleMouseUp() {
        // If dragging, update the last position
        if (this.dragWindow) {
            const windowEl = this.dragWindow;
            const rect = windowEl.getBoundingClientRect();
            
            windowEl._windowManager.lastPosition = { 
                left: rect.left, 
                top: rect.top 
            };
            
            // Reset will-change to default when done dragging
            windowEl.style.willChange = 'transform';
            
            windowEl._windowManager.isDragging = false;
            this.dragWindow = null;
        }
        
        // If resizing, update the last size
        if (this.resizeWindow) {
            const windowEl = this.resizeWindow;
            const rect = windowEl.getBoundingClientRect();
            
            windowEl._windowManager.lastSize = { 
                width: rect.width, 
                height: rect.height 
            };
            
            // Remove resizing class when done
            windowEl.classList.remove('resizing');
            
            // Reset will-change to default when done resizing
            windowEl.style.willChange = 'transform';
            
            windowEl._windowManager.isResizing = false;
            this.resizeWindow = null;
        }
        
        // Cancel any pending animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}

// Create and export a singleton instance
const windowManager = new WindowManager();
export default windowManager;

// Export for CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = windowManager;
}

// Expose to global scope if in browser environment
if (typeof window !== 'undefined') {
    window.WindowManager = WindowManager;
    window.windowManager = windowManager;
} 