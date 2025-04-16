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
        
        // Window snapping settings
        this.snapThreshold = 30; // px from edge to trigger snapping
        this.snapActivated = false; // Track if snap is currently active
        this.snapIndicator = null; // Element to show snap preview
        
        // Document viewer widget tracking
        this.widgetContainer = null;
        this.widgets = new Map(); // Map of widgetId -> widget element
        this.widgetSnapActivated = false;
        this.widgetSnapIndicator = null;
        
        // Initialize the global event listeners
        this._initGlobalEventListeners();
        
        // Create minimized window bar
        this._createMinimizedBar();
        
        // Create snap indicator
        this._createSnapIndicator();
        
        // Create widget snap indicator
        this._createWidgetSnapIndicator();
        
        // Setup widget container
        this._setupWidgetContainer();
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
        minimizedBar.style.display = 'flex'; // Always show the bar
        
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
     * @param {HTMLElement} windowEl - The window to close
     * @returns {boolean} Whether the window was successfully closed
     */
    closeWindow(windowEl) {
        if (!windowEl || !windowEl._windowManager) return false;

        // Check if closing is allowed (custom onBeforeClose handler)
        if (typeof windowEl._windowManager.onBeforeClose === 'function') {
            if (windowEl._windowManager.onBeforeClose(windowEl) === false) {
                return false;
            }
        }

        // If this window is a widget, clean up the widget before closing
        if (windowEl._windowManager.isWidget) {
            const windowId = windowEl._windowManager.id;
            const widgetData = this.widgets.get(windowId);
            
            if (widgetData && widgetData.widget) {
                this._cleanupWidget(widgetData.widget);
                widgetData.widget.remove();
                this.widgets.delete(windowId);
                this._arrangeWidgets();
            }
        }
        
        // Remove the window from the DOM
        windowEl.remove();
        
        // Trigger the onClose callback
        if (typeof windowEl._windowManager.onClose === 'function') {
            windowEl._windowManager.onClose(windowEl);
        }
        
        return true;
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
        
        // Keep the minimized bar visible even when empty
        this.minimizedBar.classList.remove('reveal');
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
        const { clientX, clientY } = e;
        
        // Handle window dragging
        if (this.dragWindow) {
            const windowEl = this.dragWindow;
            const { startX, startY, startLeft, startTop } = windowEl._windowManager;
            
            // Calculate new position
            const dx = clientX - startX;
            const dy = clientY - startY;
            let left = startLeft + dx;
            let top = startTop + dy;
            
            // Get window size
            const width = windowEl.offsetWidth;
            const height = windowEl.offsetHeight;
            
            // Keep window within viewport bounds
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Allow some overflow but keep controls accessible
            const minVisibleX = -width + 100;
            const maxVisibleX = viewportWidth - 100;
            const minVisibleY = 0; // Don't allow dragging above viewport
            const maxVisibleY = viewportHeight - 50; // Keep window title bar visible
            
            left = Math.max(minVisibleX, Math.min(maxVisibleX, left));
            top = Math.max(minVisibleY, Math.min(maxVisibleY, top));
            
            // Update position
            windowEl.style.left = `${left}px`;
            windowEl.style.top = `${top}px`;
            
            // Check for snap zones
            const snapPosition = this._getSnapPosition(clientX, clientY);
            
            // Show or hide snap indicator based on proximity to snap zones
            if (snapPosition && !windowEl._windowManager.isMaximized) {
                this.snapActivated = true;
                this._showSnapIndicator(snapPosition);
            } else {
                // Hide snap indicator when not over a snap zone
                if (this.snapActivated) {
                    this._hideSnapIndicator();
                    this.snapActivated = false;
                }
                
                // Check for widget snap activation
                if (this._checkWidgetSnapActivation(clientX, clientY, windowEl)) {
                    if (!this.widgetSnapActivated) {
                        this._showWidgetSnapIndicator();
                        this.widgetSnapActivated = true;
                        // Add a visual effect to the window being dragged
                        windowEl.classList.add('widget-snap-candidate');
                    }
                } else if (this.widgetSnapActivated) {
                    this._hideWidgetSnapIndicator();
                    this.widgetSnapActivated = false;
                    // Remove visual effect
                    windowEl.classList.remove('widget-snap-candidate');
                }
            }
            
            // Call onMove callback if provided
            if (windowEl._windowManager && typeof windowEl._windowManager.onMove === 'function') {
                windowEl._windowManager.onMove({
                    left,
                    top,
                    width: windowEl.offsetWidth,
                    height: windowEl.offsetHeight
                });
            }
        }
        
        // Handle window resizing
        if (this.resizeWindow) {
            const windowEl = this.resizeWindow;
            
            const dx = clientX - windowEl._windowManager.startX;
            const dy = clientY - windowEl._windowManager.startY;
            
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
     * Handle mouse up events
     * @private
     */
    _handleMouseUp() {
        // If dragging, update the last position
        if (this.dragWindow) {
            const windowEl = this.dragWindow;
            
            // Apply widget conversion if activated
            if (this.widgetSnapActivated) {
                // Convert the window to a widget
                this._convertToWidget(windowEl);
                this._hideWidgetSnapIndicator();
                this.widgetSnapActivated = false;
                windowEl.classList.remove('widget-snap-candidate');
            } 
            // Apply window snap if activated
            else if (this.snapActivated && !windowEl._windowManager.isMaximized) {
                const position = this._getSnapPosition(
                    this.dragWindow.lastX, 
                    this.dragWindow.lastY
                );
                if (position) {
                    this._snapWindow(windowEl, position);
                    // Add animation class to show snap transition
                    windowEl.classList.add('snap-animation');
                    setTimeout(() => {
                        windowEl.classList.remove('snap-animation');
                    }, 300);
                }
                this._hideSnapIndicator();
                this.snapActivated = false;
            }
            
            // Clear drag state
            this.dragWindow = null;
        }
        
        // If resizing, update the final size
        if (this.resizeWindow) {
            const windowEl = this.resizeWindow;
            
            // Apply any final size adjustments here
            
            // Clear resize state
            this.resizeWindow = null;
            windowEl.classList.remove('resizing');
            
            // Call onResize callback if provided
            if (windowEl._windowManager && typeof windowEl._windowManager.onResize === 'function') {
                windowEl._windowManager.onResize({
                    width: windowEl.offsetWidth,
                    height: windowEl.offsetHeight,
                    left: parseInt(windowEl.style.left),
                    top: parseInt(windowEl.style.top)
                });
            }
        }
        
        // Clear animation frame ID
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Create snap indicator overlay
     * @private
     */
    _createSnapIndicator() {
        if (this.snapIndicator) return;
        
        const indicator = document.createElement('div');
        indicator.className = 'window-snap-indicator';
        indicator.style.position = 'fixed';
        indicator.style.zIndex = '999';
        indicator.style.pointerEvents = 'none';
        indicator.style.backgroundColor = 'rgba(47, 129, 247, 0.2)';
        indicator.style.border = '2px solid rgba(47, 129, 247, 0.5)';
        indicator.style.borderRadius = '8px';
        indicator.style.display = 'none';
        indicator.style.transition = 'all 0.15s ease-out';
        
        document.body.appendChild(indicator);
        this.snapIndicator = indicator;
    }
    
    /**
     * Show snap indicator in specified position
     * @private
     * @param {string} position - Position identifier ('left', 'right', 'top-left', etc.)
     */
    _showSnapIndicator(position) {
        if (!this.snapIndicator) return;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Set indicator styles based on position
        switch (position) {
            case 'left':
                this.snapIndicator.style.top = '0';
                this.snapIndicator.style.left = '0';
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight}px`;
                break;
            case 'right':
                this.snapIndicator.style.top = '0';
                this.snapIndicator.style.left = `${viewportWidth / 2}px`;
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight}px`;
                break;
            case 'top-left':
                this.snapIndicator.style.top = '0';
                this.snapIndicator.style.left = '0';
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight / 2}px`;
                break;
            case 'top-right':
                this.snapIndicator.style.top = '0';
                this.snapIndicator.style.left = `${viewportWidth / 2}px`;
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight / 2}px`;
                break;
            case 'bottom-left':
                this.snapIndicator.style.top = `${viewportHeight / 2}px`;
                this.snapIndicator.style.left = '0';
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight / 2}px`;
                break;
            case 'bottom-right':
                this.snapIndicator.style.top = `${viewportHeight / 2}px`;
                this.snapIndicator.style.left = `${viewportWidth / 2}px`;
                this.snapIndicator.style.width = `${viewportWidth / 2}px`;
                this.snapIndicator.style.height = `${viewportHeight / 2}px`;
                break;
            default:
                this.snapIndicator.style.display = 'none';
                return;
        }
        
        this.snapIndicator.style.display = 'block';
    }
    
    /**
     * Hide snap indicator
     * @private
     */
    _hideSnapIndicator() {
        if (this.snapIndicator) {
            this.snapIndicator.style.display = 'none';
        }
    }
    
    /**
     * Check if window should snap and return the snap position
     * @private
     * @param {number} mouseX - Current mouse X position
     * @param {number} mouseY - Current mouse Y position
     * @returns {string|null} - Snap position or null if no snap should occur
     */
    _getSnapPosition(mouseX, mouseY) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const threshold = this.snapThreshold;
        
        // Check corners first (they have higher priority)
        // Top-left corner
        if (mouseX <= threshold && mouseY <= threshold) {
            return 'top-left';
        }
        
        // Top-right corner
        if (mouseX >= viewportWidth - threshold && mouseY <= threshold) {
            return 'top-right';
        }
        
        // Bottom-left corner
        if (mouseX <= threshold && mouseY >= viewportHeight - threshold) {
            return 'bottom-left';
        }
        
        // Bottom-right corner
        if (mouseX >= viewportWidth - threshold && mouseY >= viewportHeight - threshold) {
            return 'bottom-right';
        }
        
        // Check edges
        // Left edge
        if (mouseX <= threshold) {
            return 'left';
        }
        
        // Right edge
        if (mouseX >= viewportWidth - threshold) {
            return 'right';
        }
        
        // No snap position detected
        return null;
    }
    
    /**
     * Apply snap to window based on position
     * @private
     * @param {HTMLElement} windowEl - Window element to snap
     * @param {string} position - Position to snap to
     */
    _snapWindow(windowEl, position) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Add snapping class for transition effect
        windowEl.classList.add('snapping');
        
        // Set window position and size based on snap position
        switch (position) {
            case 'left':
                windowEl.style.left = '0';
                windowEl.style.top = '0';
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight}px`;
                break;
            case 'right':
                windowEl.style.left = `${viewportWidth / 2}px`;
                windowEl.style.top = '0';
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight}px`;
                break;
            case 'top-left':
                windowEl.style.left = '0';
                windowEl.style.top = '0';
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight / 2}px`;
                break;
            case 'top-right':
                windowEl.style.left = `${viewportWidth / 2}px`;
                windowEl.style.top = '0';
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight / 2}px`;
                break;
            case 'bottom-left':
                windowEl.style.left = '0';
                windowEl.style.top = `${viewportHeight / 2}px`;
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight / 2}px`;
                break;
            case 'bottom-right':
                windowEl.style.left = `${viewportWidth / 2}px`;
                windowEl.style.top = `${viewportHeight / 2}px`;
                windowEl.style.width = `${viewportWidth / 2}px`;
                windowEl.style.height = `${viewportHeight / 2}px`;
                break;
        }
        
        // Add animation class
        windowEl.classList.add('snap-animation');
        
        // Remove classes after transitions complete
        setTimeout(() => {
            windowEl.classList.remove('snapping');
            windowEl.classList.remove('snap-animation');
        }, 500);
        
        // Update window manager data
        const rect = windowEl.getBoundingClientRect();
        windowEl._windowManager.lastPosition = { 
            left: rect.left, 
            top: rect.top 
        };
            windowEl._windowManager.lastSize = { 
                width: rect.width, 
                height: rect.height 
            };
            
        // Call onResize callback if provided
        if (typeof windowEl._windowManager.onResize === 'function') {
            windowEl._windowManager.onResize(windowEl);
        }
        
        // Call onMove callback if provided
        if (typeof windowEl._windowManager.onMove === 'function') {
            windowEl._windowManager.onMove(windowEl);
        }
    }
    
    /**
     * Set up the widget container
     * @private
     */
    _setupWidgetContainer() {
        // Find the widget container element
        this.widgetContainer = document.getElementById('widget-container');
        
        if (!this.widgetContainer) {
            // Create a widget container if it doesn't exist
            this.widgetContainer = document.createElement('div');
            this.widgetContainer.id = 'widget-container';
            this.widgetContainer.className = 'document-widgets-container';
            
            // Find the tools pane content to append the container
            const toolsPane = document.querySelector('.pane.tools .pane-content');
            if (toolsPane) {
                toolsPane.appendChild(this.widgetContainer);
            } else {
                // Fallback to body if tools pane not found
                document.body.appendChild(this.widgetContainer);
            }
        }
        
        // Ensure proper styling for widget container
        this.widgetContainer.style.position = 'relative';
        this.widgetContainer.style.overflowY = 'auto';
        this.widgetContainer.style.paddingTop = '15px';
        this.widgetContainer.style.paddingBottom = '15px';
        this.widgetContainer.style.minHeight = '100%';
        
        // Add grid pattern background
            this.widgetContainer.style.backgroundImage = 'linear-gradient(rgba(var(--accent-color-rgb), 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--accent-color-rgb), 0.05) 1px, transparent 1px)';
            this.widgetContainer.style.backgroundSize = '20px 20px';
            this.widgetContainer.style.backgroundPosition = '0 0';
            this.widgetContainer.style.backgroundAttachment = 'local';
            
        // Initialize widgets Map to track widgets and their associated windows
        this.widgets = new Map();
        
        // Set up resize observer for responsive width
        this._setupResizeObserver();
    }
    
    /**
     * Set up resize observer for responsive widget widths
     * @private
     */
    _setupResizeObserver() {
        // Create a resize observer to monitor container width changes
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.target === this.widgetContainer) {
                    this._updateWidgetWidths();
                }
            }
        });
        
        // Start observing the widget container
        this.resizeObserver.observe(this.widgetContainer);
    }
    
    /**
     * Update widget widths based on container width
     * @private
     */
    _updateWidgetWidths() {
        if (!this.widgetContainer) return;
        
        // Calculate new width based on container
        const containerRect = this.widgetContainer.getBoundingClientRect();
        const newWidth = containerRect.width - 20; // Account for padding
        
        // Update all widgets
        const widgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'));
        widgets.forEach(widget => {
            // Skip transition if widget is being resized
            const isResizing = widget.classList.contains('resizing');
            widget.style.transition = isResizing ? 'none' : 'width 0.2s ease-out';
            widget.style.width = `${newWidth}px`;
        });
    }
    
    /**
     * Create widget snap indicator
     * @private
     */
    _createWidgetSnapIndicator() {
        if (this.widgetSnapIndicator) return;
        
        const indicator = document.createElement('div');
        indicator.className = 'widget-snap-indicator';
        indicator.style.display = 'none';
        
        // Add visual enhancement for improved UX
        indicator.style.boxShadow = '0 0 15px var(--accent-color)';
        indicator.style.border = '2px dashed var(--accent-color)';
        indicator.style.backgroundColor = 'rgba(var(--accent-color-rgb), 0.1)';
        indicator.style.backdropFilter = 'blur(2px)';
        indicator.style.transition = 'all 0.2s ease-out';
        
        // Add animation to draw attention
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse-border {
                0% { border-color: rgba(var(--accent-color-rgb), 0.3); }
                50% { border-color: rgba(var(--accent-color-rgb), 1); }
                100% { border-color: rgba(var(--accent-color-rgb), 0.3); }
            }
            .widget-snap-indicator {
                animation: pulse-border 1.5s infinite ease-in-out;
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(indicator);
        this.widgetSnapIndicator = indicator;
    }
    
    /**
     * Check if a window can be converted to a widget (currently only document readers)
     * @private
     * @param {HTMLElement} windowEl - The window to check
     * @returns {boolean} - Whether the window can be converted to a widget
     */
    _canConvertToWidget(windowEl) {
        // Check if it's a document reader window
        if (!windowEl.classList.contains('document-reader')) return false;
        
        // Check if it has content that can be converted to a widget
        const contentEl = windowEl.querySelector('.window-manager-content');
        if (!contentEl) return false;
        
        const documentContent = contentEl.querySelector('.document-reader-content');
        if (!documentContent) return false;
        
        // Check for either text content or image content
        const hasTextContent = documentContent.textContent.trim().length > 0;
        const hasImageContent = documentContent.querySelector('img') !== null;
        
        return hasTextContent || hasImageContent;
    }
    
    /**
     * Check if the mouse is over the data analysis pane/widget container
     * @private
     * @param {number} mouseX - Mouse X coordinate
     * @param {number} mouseY - Mouse Y coordinate
     * @returns {boolean} - Whether the mouse is over the widget container
     */
    _isOverDataAnalysisPane(mouseX, mouseY) {
        const toolsPane = document.querySelector('.pane.tools');
        if (!toolsPane) return false;
        
        const rect = toolsPane.getBoundingClientRect();
        
        // Create a more generous drop zone by adding a margin around the actual pane
        // This makes it easier for users to drop widgets into the container
        const margin = 30; // pixels of extra drop zone margin
        
        // Enhanced drop zone with margin
        return (
            mouseX >= rect.left - margin &&
            mouseX <= rect.right + margin &&
            mouseY >= rect.top - margin &&
            mouseY <= rect.bottom + margin
        );
    }
    
    /**
     * Enhanced widget snap detection during window movement
     * @private
     * @param {number} mouseX - Mouse X coordinate
     * @param {number} mouseY - Mouse Y coordinate
     * @param {HTMLElement} windowEl - The window being moved
     * @returns {boolean} - Whether snap activation should occur
     */
    _checkWidgetSnapActivation(mouseX, mouseY, windowEl) {
        // First check if the window can be converted to a widget
        if (!this._canConvertToWidget(windowEl)) return false;
        
        // Check if we're over or approaching the widget container
        const isOverPane = this._isOverDataAnalysisPane(mouseX, mouseY);
        
        // If we're over the pane, we should also check the approach vector
        // to detect if the user is intentionally moving toward the pane
        if (isOverPane) {
            // Get the window's center position
            const windowRect = windowEl.getBoundingClientRect();
            const windowCenterX = windowRect.left + windowRect.width / 2;
            const windowCenterY = windowRect.top + windowRect.height / 2;
            
            // Get the pane's center
            const toolsPane = document.querySelector('.pane.tools');
            const paneRect = toolsPane.getBoundingClientRect();
            const paneCenterX = paneRect.left + paneRect.width / 2;
            const paneCenterY = paneRect.top + paneRect.height / 2;
            
            // Calculate the movement vector (normalized)
            const moveVectorX = mouseX - windowCenterX;
            const moveVectorY = mouseY - windowCenterY;
            
            // Calculate the vector to the pane center
            const paneVectorX = paneCenterX - windowCenterX;
            const paneVectorY = paneCenterY - windowCenterY;
            
            // Calculate dot product to determine if moving toward pane
            const dotProduct = moveVectorX * paneVectorX + moveVectorY * paneVectorY;
            
            // If moving toward the pane, show the snap indicator
            return dotProduct > 0;
        }
        
        return false;
    }
    
    /**
     * Show widget snap indicator
     * @private
     */
    _showWidgetSnapIndicator() {
        if (!this.widgetSnapIndicator || !this.widgetContainer) return;
        
        const toolsPane = document.querySelector('.pane.tools');
        if (!toolsPane) return;
        
        // Get the actual content area of the pane
        const toolsPaneContent = toolsPane.querySelector('.pane-content');
        const contentRect = toolsPaneContent.getBoundingClientRect();
        
        // Get the widget container's position and dimensions
        const containerRect = this.widgetContainer.getBoundingClientRect();
        
        // Calculate the insertion point based on existing widgets
        const existingWidgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'));
        let totalExistingHeight = 0;
        const gap = 15; // Same gap as in _arrangeWidgets
        
        existingWidgets.forEach(widget => {
            totalExistingHeight += widget.offsetHeight + gap;
        });
        
        // Calculate widget height (approximately 1/3 of the available height or maintain consistent height)
        const widgetHeight = Math.max(150, Math.min(250, Math.floor(contentRect.height / 3)));
        
        // Set the indicator position to match exactly where the widget will be placed
        // Use the container's coordinates for more accurate positioning
        this.widgetSnapIndicator.style.top = `${containerRect.top + totalExistingHeight}px`;
        this.widgetSnapIndicator.style.left = `${containerRect.left + 10}px`; // Match left margin in _arrangeWidgets
        this.widgetSnapIndicator.style.width = `${containerRect.width - 20}px`; // Account for padding
        this.widgetSnapIndicator.style.height = `${widgetHeight}px`;
        this.widgetSnapIndicator.style.display = 'block';
        
        // Add a pulsing animation to make it more noticeable
        this.widgetSnapIndicator.style.animation = 'pulse 1.5s infinite ease-in-out';
        
        // Add a label to make it clearer
        if (!this.widgetSnapIndicator.querySelector('.snap-label')) {
            const snapLabel = document.createElement('div');
            snapLabel.className = 'snap-label';
            snapLabel.textContent = 'Drop to add widget here';
            snapLabel.style.position = 'absolute';
            snapLabel.style.top = '50%';
            snapLabel.style.left = '50%';
            snapLabel.style.transform = 'translate(-50%, -50%)';
            snapLabel.style.color = 'var(--accent-color)';
            snapLabel.style.fontWeight = 'bold';
            snapLabel.style.textShadow = '0 0 5px rgba(0,0,0,0.5)';
            this.widgetSnapIndicator.appendChild(snapLabel);
        }
    }
    
    /**
     * Hide widget snap indicator
     * @private
     */
    _hideWidgetSnapIndicator() {
        if (this.widgetSnapIndicator) {
            this.widgetSnapIndicator.style.display = 'none';
        }
    }
    
    /**
     * Restore a window from its widget form
     * @private
     * @param {string} windowId - The window ID to restore
     * @param {Object} [targetPosition] - Optional position to restore to
     */
    _restoreFromWidget(windowId, targetPosition = null) {
        // Find the window by ID
        const windowEl = this.findWindowById(windowId);
        if (!windowEl) return;
        
        // Get widget data from the map
        const widgetData = this.widgets.get(windowId);
        if (!widgetData) return;
        
        const widget = widgetData.widget;
        if (!widget) return;
        
        // Clean up the widget event listeners
        this._cleanupWidget(widget);
        
        // Get the current position and size of the widget for animated transition
        const widgetRect = widget.getBoundingClientRect();
        
        // Calculate dimensions for the restored window
        const windowWidth = windowEl._windowManager.originalState?.width 
            ? parseInt(windowEl._windowManager.originalState.width) 
            : Math.max(400, widgetRect.width);
            
        const windowHeight = windowEl._windowManager.originalState?.height 
            ? parseInt(windowEl._windowManager.originalState.height) 
            : Math.max(300, widgetRect.height * 1.5);
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Center the window in the viewport
        const restoreLeft = Math.max(0, Math.floor((viewportWidth - windowWidth) / 2));
        const restoreTop = Math.max(0, Math.floor((viewportHeight - windowHeight) / 2));
        
        // Position the window
        windowEl.style.left = `${restoreLeft}px`;
        windowEl.style.top = `${restoreTop}px`;
        windowEl.style.width = `${windowWidth}px`;
        windowEl.style.height = `${windowHeight}px`;
        windowEl.style.display = 'flex';
        
        // Reset widget status in window manager
        windowEl._windowManager.isWidget = false;
        delete windowEl._windowManager.widgetElement;
        
        // Fix for document reader windows
        if (windowEl.classList.contains('document-reader')) {
            // Make sure search bar is properly positioned
            const searchBar = windowEl.querySelector('.document-reader-search');
            const contentContainer = windowEl.querySelector('.window-manager-content');
            
            // If search bar exists but is in the wrong place, reattach it
            if (searchBar && contentContainer && contentContainer.parentNode) {
                // Move search bar to the bottom of the window (after content)
                contentContainer.parentNode.appendChild(searchBar);
                
                // Make sure search bar is visible
                searchBar.style.display = 'flex';
                
                // Ensure content container has proper styling for scrolling
                contentContainer.style.flex = '1';
                contentContainer.style.overflowY = 'auto';
            }
            
            // Fix any content styling
            const documentContent = windowEl.querySelector('.document-reader-content');
            if (documentContent) {
                // Ensure content is scrollable
                documentContent.style.overflow = 'auto';
                
                // If it's an image, make sure it's sized properly
                const img = documentContent.querySelector('img');
                if (img) {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                }
            }
        }
        
        // Create a visual effect for removal
        const ghostWidget = widget.cloneNode(true);
        ghostWidget.style.position = 'absolute';
        ghostWidget.style.left = `${widgetRect.left}px`;
        ghostWidget.style.top = `${widgetRect.top}px`;
        ghostWidget.style.width = `${widgetRect.width}px`;
        ghostWidget.style.height = `${widgetRect.height}px`;
        ghostWidget.style.zIndex = '9999';
        ghostWidget.style.animation = 'widget-disappear 0.3s ease-out forwards';
        ghostWidget.style.pointerEvents = 'none';
        
        // Define custom animation for ghost element
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes widget-disappear {
                0% { 
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                100% { 
                    opacity: 0;
                    transform: translateY(20px) scale(0.9);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(ghostWidget);
        
        // Remove the ghost after animation
        setTimeout(() => {
            ghostWidget.remove();
            style.remove();
        }, 300);
        
        // Ensure window is brought to front
        this.focusWindow(windowEl);
        
        // Remove from widgets tracking
        this.widgets.delete(windowId);
        
        // Remove the actual widget
        widget.remove();
        
        // Rearrange remaining widgets
        this._arrangeWidgets();
    }
    
    /**
     * Arrange widgets in the container
     * @private
     */
    _arrangeWidgets() {
        // Skip if no widgets
        if (this.widgets.size === 0) return;
        
        // Get all widgets and sort by creation time
        const widgetElements = Array.from(this.widgets.values())
            .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp, oldest first
            .map(data => data.widget)
            .filter(widget => widget && widget.parentNode);
        
        // Calculate container dimensions
        const containerRect = this.widgetContainer.getBoundingClientRect();
        const containerWidth = containerRect.width - 20; // Account for padding
        
        // Calculate widget spacing
        const topPadding = 15; // Match the paddingTop value set in _setupWidgetContainer
        let offset = topPadding; // Start with top padding
        const gap = 15; // Spacing between widgets
        
        // Position widgets in a stack with proper sizing and transitions
        widgetElements.forEach((widget, index) => {
            // Skip transition only when actively resizing
            const isResizing = widget.classList.contains('resizing');
            widget.style.transition = isResizing ? 'none' : 'top 0.3s ease-out';
            
            // Ensure consistent width
            widget.style.width = `${containerWidth}px`;
            widget.style.position = 'absolute'; // Ensure absolute positioning works
            
            // Set position
            widget.style.top = `${offset}px`;
            widget.style.left = '10px'; // Consistent left margin
            
            // Apply consistent transform
            widget.style.transform = 'none';
            
            // Update offset for next widget
            offset += widget.offsetHeight + gap;
        });
        
        // Update container height to accommodate all widgets, ensuring the background grid covers everything
        this.widgetContainer.style.height = `${Math.max(offset, containerRect.height)}px`;
        
        // Ensure container is scrollable if widgets overflow
        this.widgetContainer.style.overflowY = 'auto';
        this.widgetContainer.style.position = 'relative'; // Needed for absolute positioning of children
        
        // Update scroll fade indicators for all widgets
        widgetElements.forEach(widget => {
            const contentEl = widget.querySelector('.document-widget-content');
            if (contentEl) {
                this._updateScrollFadeIndicator(contentEl);
            }
        });
    }
    
    /**
     * Update the fade effect visibility based on content scrollability
     * @private
     * @param {HTMLElement} contentEl - The content element to check
     */
    _updateScrollFadeIndicator(contentEl) {
        if (!contentEl) return;
        
        // Check if content is scrollable
        const isScrollable = contentEl.scrollHeight > contentEl.clientHeight;
        
        // Check if at the bottom
        const isAtBottom = Math.abs(contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight) < 5;
        
        // Determine if fade should be visible
        const shouldShowFade = isScrollable && !isAtBottom;
        
        // Apply fade effect
        if (shouldShowFade) {
            contentEl.classList.add('has-more-content');
        } else {
            contentEl.classList.remove('has-more-content');
        }
    }
    
    /**
     * Convert window to widget
     * @private
     * @param {HTMLElement} windowEl - The window to convert
     */
    _convertToWidget(windowEl) {
        if (!this._canConvertToWidget(windowEl) || !this.widgetContainer) return;

        // Save original window data for restoration later
        windowEl._windowManager.originalState = {
            width: windowEl.style.width,
            height: windowEl.style.height,
            left: windowEl.style.left,
            top: windowEl.style.top
        };

        // Get document data
        const title = windowEl._windowManager.title;
        const windowId = windowEl._windowManager.id;
        const contentEl = windowEl.querySelector('.window-manager-content');
        const searchBar = windowEl.querySelector('.document-reader-search');

        // Create widget
        const widget = document.createElement('div');
        widget.className = 'document-widget';
        widget.setAttribute('data-window-id', windowId);

        // Create widget header
        const widgetHeader = document.createElement('div');
        widgetHeader.className = 'document-widget-header';

        const widgetTitle = document.createElement('div');
        widgetTitle.className = 'document-widget-title';
        widgetTitle.textContent = title;

        const widgetControls = document.createElement('div');
        widgetControls.className = 'document-widget-controls';

        const restoreButton = document.createElement('button');
        restoreButton.className = 'document-widget-button restore';
        restoreButton.innerHTML = '⤢';
        restoreButton.title = 'Restore window';
        restoreButton.addEventListener('click', () => this._restoreFromWidget(windowId));

        const closeButton = document.createElement('button');
        closeButton.className = 'document-widget-button close';
        closeButton.innerHTML = '×';
        closeButton.title = 'Close';
        closeButton.addEventListener('click', () => {
            const window = this.findWindowById(windowId);
            if (window) {
                this.closeWindow(window);
            }
        });

        widgetControls.appendChild(restoreButton);
        widgetControls.appendChild(closeButton);
        widgetHeader.appendChild(widgetTitle);
        widgetHeader.appendChild(widgetControls);

        // Create widget content
        const widgetContent = document.createElement('div');
        widgetContent.className = 'document-widget-content';

        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'document-widget-resize-handle';

        // Add widget to DOM
        widget.appendChild(widgetHeader);
        widget.appendChild(widgetContent);
        widget.appendChild(resizeHandle);

        // Calculate placement position - append to the end
        const existingWidgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'));
        let insertAfter = null;

        if (existingWidgets.length > 0) {
            insertAfter = existingWidgets[existingWidgets.length - 1];
            if (insertAfter && insertAfter.nextSibling) {
                this.widgetContainer.insertBefore(widget, insertAfter.nextSibling);
            } else {
                this.widgetContainer.appendChild(widget);
            }
        } else {
            this.widgetContainer.appendChild(widget);
        }

        // Handle content transfer based on type
        if (contentEl) {
            // Get original document content
            const originalContent = contentEl.querySelector('.document-reader-content');
            if (originalContent) {
                // Check if it's an image
                const imageElement = originalContent.querySelector('img');
                if (imageElement) {
                    // Create a container for the image to help with sizing
                    const imageContainer = document.createElement('div');
                    imageContainer.className = 'image-container';
                    imageContainer.style.display = 'flex';
                    imageContainer.style.justifyContent = 'center';
                    imageContainer.style.alignItems = 'center';
                    imageContainer.style.height = '100%';
                    imageContainer.style.overflow = 'hidden';

                    // Clone image content and preserve all attributes
                    const clonedImage = imageElement.cloneNode(true);
                    
                    // Wait for image to load to get its natural dimensions
                    clonedImage.onload = () => {
                        const containerWidth = widgetContent.clientWidth;
                        const containerHeight = widgetContent.clientHeight;
                        const imageWidth = clonedImage.naturalWidth;
                        const imageHeight = clonedImage.naturalHeight;
                        
                        // Calculate the best fit while maintaining aspect ratio
                        const widthRatio = containerWidth / imageWidth;
                        const heightRatio = containerHeight / imageHeight;
                        const scale = Math.min(widthRatio, heightRatio);
                        
                        // Set the image dimensions
                        clonedImage.style.width = `${imageWidth * scale}px`;
                        clonedImage.style.height = `${imageHeight * scale}px`;
                        clonedImage.style.objectFit = 'contain';
                        
                        // Adjust widget height to match the scaled image height plus header
                        const headerHeight = widgetHeader.offsetHeight;
                        const padding = 20; // Account for padding
                        const totalHeight = Math.min(
                            (imageHeight * scale) + headerHeight + padding,
                            Math.floor(window.innerHeight * 0.4) // Max 40% of window height
                        );
                        widget.style.height = `${totalHeight}px`;
                    };

                    imageContainer.appendChild(clonedImage);
                    widgetContent.appendChild(imageContainer);
                } else {
                    // For text content, get from the original content or dataset
                    const textContent = originalContent.dataset.originalContent || originalContent.textContent;
                    if (textContent) {
                        // Check if content is HTML
                        if (/<[^>]+>/i.test(textContent)) {
                            // If it's HTML content, render it properly
                            widgetContent.innerHTML = textContent;
                        } else {
                            // Otherwise treat as plain text
                            widgetContent.textContent = textContent;
                        }
                    }
                }
            }
        }

        // Hide the original window but keep it in the registry
        windowEl.style.display = 'none';
        windowEl._windowManager.isWidget = true;
        windowEl._windowManager.widgetElement = widget;

        // Add to widget tracking
        this.widgets.set(windowId, {
            window: windowEl,
            widget: widget,
            timestamp: Date.now() // Add timestamp for consistent ordering
        });

        // Set initial widget height
        const toolsPane = document.querySelector('.pane.tools');
        const toolsPaneContent = toolsPane.querySelector('.pane-content');
        const contentRect = toolsPaneContent.getBoundingClientRect();
        
        // For text widgets, use standard height
        if (!widgetContent.querySelector('img')) {
            const widgetHeight = Math.max(150, Math.min(200, Math.floor(contentRect.height / 4)));
            widget.style.height = `${widgetHeight}px`;
        }

        // Show fade indicator if content is scrollable
        this._updateScrollFadeIndicator(widgetContent);

        // Add scroll event listener to toggle fade effect
        widgetContent.addEventListener('scroll', () => {
            this._updateScrollFadeIndicator(widgetContent);
        });

        // Also update on resize
        window.addEventListener('resize', () => {
            this._updateScrollFadeIndicator(widgetContent);
        });

        // Add appear animation
        widget.style.animation = 'widget-appear 0.3s ease-out forwards';

        // Make widget draggable to restore it back to a window
        this._makeWidgetDraggable(widget, windowId);

        // Arrange widgets in stack
        this._arrangeWidgets();

        return widget;
    }
    
    /**
     * Make a widget draggable for reordering
     * @private
     * @param {HTMLElement} widget - The widget element
     */
    _makeWidgetDraggable(widget, windowId) {
        let isDragging = false;
        let startX, startY;
        let originalTransform;
        let ghostElement = null;
        let widgetRect = null;
        let dropIndicator = null;
        let lastUpdateTime = 0;
        const UPDATE_THROTTLE = 16; // ~60fps
        
        const widgetHeader = widget.querySelector('.document-widget-header');
        if (!widgetHeader) return;
        
        // Create drop indicator element if it doesn't exist yet
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'widget-drop-indicator';
        dropIndicator.style.display = 'none';
        this.widgetContainer.appendChild(dropIndicator);
        
        // Mouse down event on widget header
        const handleMouseDown = (e) => {
            if (e.button !== 0) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            widgetRect = widget.getBoundingClientRect();
            originalTransform = widget.style.transform;
            
            // Create ghost element with hardware acceleration
            ghostElement = widget.cloneNode(true);
            ghostElement.style.position = 'fixed';
            ghostElement.style.top = `${widgetRect.top}px`;
            ghostElement.style.left = `${widgetRect.left}px`;
            ghostElement.style.width = `${widgetRect.width}px`;
            ghostElement.style.height = `${widgetRect.height}px`;
            ghostElement.style.opacity = '0.7';
            ghostElement.style.pointerEvents = 'none';
            ghostElement.style.zIndex = '10000';
            ghostElement.style.boxShadow = '0 0 15px rgba(var(--accent-color-rgb), 0.5)';
            ghostElement.style.willChange = 'transform';
            ghostElement.style.transform = 'translateZ(0)';
            document.body.appendChild(ghostElement);
            
            widget.style.opacity = '0.3';
            widget.style.willChange = 'transform';
            widget.style.transform = 'translateZ(0)';
            
            e.preventDefault();
        };
        
        // Mouse move event with throttling
        const handleMouseMove = (e) => {
            if (!isDragging || !ghostElement) return;
            
            const currentTime = performance.now();
            if (currentTime - lastUpdateTime < UPDATE_THROTTLE) return;
            lastUpdateTime = currentTime;
            
            // Move ghost element with the mouse cursor
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            ghostElement.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            
            // Store last known mouse position for immediate use in mouseup
            widget._lastMouseX = e.clientX;
            widget._lastMouseY = e.clientY;
            
            // Check if we've moved the widget outside of the widget container
            const containerRect = this.widgetContainer.getBoundingClientRect();
            const ghostRect = ghostElement.getBoundingClientRect();
            
            const isOutsideContainer = (
                ghostRect.right < containerRect.left ||
                ghostRect.left > containerRect.right ||
                ghostRect.bottom < containerRect.top ||
                ghostRect.top > containerRect.bottom
            );
            
            if (isOutsideContainer) {
                ghostElement.style.boxShadow = '0 0 20px rgba(0, 120, 255, 0.8)';
                ghostElement.style.border = '2px dashed rgba(0, 120, 255, 0.8)';
                dropIndicator.style.display = 'none';
                widget._dropState = 'outside';
                return;
            }
            
            ghostElement.style.boxShadow = '0 0 15px rgba(var(--accent-color-rgb), 0.5)';
            ghostElement.style.border = 'none';
            
            // Get current mouse Y position
            const mouseY = e.clientY;
            
            // Find all widgets except the one being dragged
            const widgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'))
                .filter(w => w !== widget);
            
            // Sort widgets by their vertical position
            const sortedWidgets = widgets.sort((a, b) => {
                const aRect = a.getBoundingClientRect();
                const bRect = b.getBoundingClientRect();
                return aRect.top - bRect.top;
            });
            
            // Cache sorted widgets for use in mouseup
            widget._sortedWidgets = sortedWidgets;
            
            // Special case: top of container
            if (mouseY <= containerRect.top + 30 || sortedWidgets.length === 0) {
                dropIndicator.style.display = 'block';
                dropIndicator.style.top = `${containerRect.top + 10}px`;
                dropIndicator.className = 'widget-drop-indicator position-top';
                dropIndicator.dataset.position = 'top';
                dropIndicator.dataset.targetWidgetId = '';
                dropIndicator.dataset.dropPosition = 'top';
                widget._dropState = 'valid';
                return;
            }
            
            // Find the closest widget to the mouse position
            let targetWidget = null;
            let dropPosition = null;
            let indicatorTop = null;
            let closestDistance = Infinity;
            
            for (let i = 0; i < sortedWidgets.length; i++) {
                const currentWidget = sortedWidgets[i];
                const currentRect = currentWidget.getBoundingClientRect();
                
                // Calculate the center point of the current widget
                const widgetCenter = currentRect.top + (currentRect.height / 2);
                
                // If mouse is above the center, place before
                if (mouseY < widgetCenter) {
                    const distance = Math.abs(mouseY - currentRect.top);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        targetWidget = currentWidget;
                        dropPosition = 'before';
                        indicatorTop = currentRect.top;
                    }
                }
                // If mouse is below the center, place after
                else {
                    const distance = Math.abs(mouseY - currentRect.bottom);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        targetWidget = currentWidget;
                        dropPosition = 'after';
                        indicatorTop = currentRect.bottom;
                    }
                }
                
                // Check spaces between widgets
                if (i < sortedWidgets.length - 1) {
                    const nextWidget = sortedWidgets[i + 1];
                    const nextRect = nextWidget.getBoundingClientRect();
                    
                    if (nextRect.top - currentRect.bottom > 10 && 
                        mouseY > currentRect.bottom && mouseY < nextRect.top) {
                        
                        const midPoint = (currentRect.bottom + nextRect.top) / 2;
                        const distanceToMid = Math.abs(mouseY - midPoint);
                        
                        if (distanceToMid < closestDistance) {
                            closestDistance = distanceToMid;
                            
                            if (mouseY < midPoint) {
                                targetWidget = currentWidget;
                                dropPosition = 'after';
                                indicatorTop = currentRect.bottom;
                            } else {
                                targetWidget = nextWidget;
                                dropPosition = 'before';
                                indicatorTop = nextRect.top;
                            }
                        }
                    }
                }
            }
            
            // Special case: below all widgets
            const lastWidget = sortedWidgets[sortedWidgets.length - 1];
            if (lastWidget) {
                const lastRect = lastWidget.getBoundingClientRect();
                if (mouseY > lastRect.bottom + 15) {
                    targetWidget = lastWidget;
                    dropPosition = 'after';
                    indicatorTop = lastRect.bottom;
                }
            }
            
            // Update indicator position
            if (targetWidget) {
                dropIndicator.style.display = 'block';
                dropIndicator.style.top = `${indicatorTop}px`;
                dropIndicator.dataset.targetWidgetId = targetWidget.dataset.windowId;
                dropIndicator.dataset.dropPosition = dropPosition;
                dropIndicator.className = `widget-drop-indicator position-${dropPosition}`;
                widget._dropState = 'valid';
            } else {
                dropIndicator.style.display = 'none';
                widget._dropState = 'invalid';
            }
        };
        
        // Mouse up event
        const handleMouseUp = (e) => {
            if (!isDragging) return;
            
            // Immediately capture necessary data before cleaning up
            const currentDropState = widget._dropState || 'invalid';
            const dropPositionInfo = {
                position: dropIndicator.dataset.dropPosition,
                targetId: dropIndicator.dataset.targetWidgetId
            };
            
            // Reset widget appearance immediately
            widget.style.opacity = '1';
            widget.style.transform = originalTransform;
            
            if (ghostElement) {
                // Remove ghost element immediately to prevent visual lag
                document.body.removeChild(ghostElement);
                ghostElement = null;
                
                // Hide indicator immediately
                dropIndicator.style.display = 'none';
                
                // Now process the drop based on the state we captured
                if (currentDropState === 'outside') {
                    // Restore widget to window if dragged outside container
                    const windowEl = this.widgets.get(windowId)?.window;
                    if (windowEl) {
                        // Use the last known mouse position
                        this._restoreFromWidget(windowId, { 
                            x: widget._lastMouseX || e.clientX, 
                            y: widget._lastMouseY || e.clientY 
                        });
                    }
                } else if (currentDropState === 'valid') {
                    // Process the drop using the information we already captured
                    // This executes immediately without any delay
                    handleDropAtPosition(dropPositionInfo);
                }
            }
            
            // Reset drag state
            isDragging = false;
            delete widget._dropState;
            delete widget._lastMouseX;
            delete widget._lastMouseY;
            delete widget._sortedWidgets;
        };
        
        // Handle placement based on drop position - now takes a position info parameter
        const handleDropAtPosition = (posInfo) => {
            const dropPosition = posInfo.position;
            const targetWidgetId = posInfo.targetId;
            
            // Remove the widget from its current position
            widget.remove();
            
            if (dropPosition === 'top') {
                // Insert at the very top of container - before any other widget
                const allRemainingWidgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'));
                if (allRemainingWidgets.length > 0) {
                    this.widgetContainer.insertBefore(widget, allRemainingWidgets[0]);
                } else {
                    this.widgetContainer.appendChild(widget);
                }
                
                // Set a timestamp that's earlier than all others
                const oldestTimestamp = Math.min(
                    ...Array.from(this.widgets.values()).map(data => data.timestamp || Date.now())
                );
                const widgetData = this.widgets.get(windowId);
                if (widgetData) {
                    widgetData.timestamp = oldestTimestamp - 1000;
                }
            } else if (!targetWidgetId) {
                // Also insert at top if no target
                const firstWidget = this.widgetContainer.querySelector('.document-widget');
                if (firstWidget) {
                    this.widgetContainer.insertBefore(widget, firstWidget);
                } else {
                    this.widgetContainer.appendChild(widget);
                }
                
                // Update widget order
                const widgetData = this.widgets.get(windowId);
                if (widgetData) {
                    widgetData.timestamp = Date.now() - 10000; // Ensure it's first
                }
            } else {
                const targetWidget = this.widgetContainer.querySelector(`.document-widget[data-window-id="${targetWidgetId}"]`);
                
                if (targetWidget) {
                    if (dropPosition === 'before') {
                        // Place it before the target widget
                        this.widgetContainer.insertBefore(widget, targetWidget);
                        
                        // Set timestamp to just before the target widget
                        const targetData = this.widgets.get(targetWidgetId);
                        const widgetData = this.widgets.get(windowId);
                        
                        if (targetData && widgetData) {
                            // If target is already at top (no previous widgets)
                            const allWidgets = Array.from(this.widgetContainer.querySelectorAll('.document-widget'));
                            const targetIndex = allWidgets.indexOf(targetWidget);
                            
                            if (targetIndex === 0) {
                                // First position
                                widgetData.timestamp = targetData.timestamp - 1000;
                            } else if (targetIndex > 0) {
                                // Between two widgets
                                const prevWidget = allWidgets[targetIndex - 1];
                                const prevId = prevWidget.dataset.windowId;
                                const prevData = this.widgets.get(prevId);
                                
                                if (prevData) {
                                    // Set timestamp between previous and target
                                    widgetData.timestamp = Math.floor((prevData.timestamp + targetData.timestamp) / 2);
                                } else {
                                    widgetData.timestamp = targetData.timestamp - 1000;
                                }
                            }
                        }
                    } else if (dropPosition === 'after') {
                        // Place it after the target widget
                        this.widgetContainer.insertBefore(widget, targetWidget.nextSibling);
                        
                        // Update widget timestamp to be just after target
                        const targetData = this.widgets.get(targetWidgetId);
                        const widgetData = this.widgets.get(windowId);
                        
                        if (targetData && widgetData) {
                            const nextWidget = targetWidget.nextSibling;
                            if (nextWidget && nextWidget.classList.contains('document-widget')) {
                                const nextId = nextWidget.dataset.windowId;
                                const nextData = this.widgets.get(nextId);
                                
                                if (nextData) {
                                    // Set timestamp between target and next
                                    widgetData.timestamp = Math.floor((targetData.timestamp + nextData.timestamp) / 2);
                                } else {
                                    widgetData.timestamp = targetData.timestamp + 1000;
                                }
                            } else {
                                // Last position
                                widgetData.timestamp = targetData.timestamp + 1000;
                            }
                        }
                    }
                } else {
                    // Fallback - append to end
                    this.widgetContainer.appendChild(widget);
                    
                    // Set timestamp to be the latest
                    const widgetData = this.widgets.get(windowId);
                    if (widgetData) {
                        widgetData.timestamp = Date.now();
                    }
                }
            }
            
            // Apply a subtle highlight effect
            widget.style.transition = 'box-shadow 0.3s ease-out';
            widget.style.boxShadow = '0 0 0 1px var(--accent-color)';
            
            // Remove highlight after animation
            setTimeout(() => {
                widget.style.boxShadow = '';
                widget.style.transition = '';
            }, 600);
            
            // Ensure the DOM structure matches our timestamp ordering
            this._arrangeWidgets();
        };
        
        // Add event listeners
        widgetHeader.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Store event listeners for cleanup
        widget._dragListeners = {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp
        };
        
        // Add cleanup method to widget
        widget._cleanupDragListeners = () => {
            if (!widget._dragListeners) return;
            
            widgetHeader.removeEventListener('mousedown', widget._dragListeners.handleMouseDown);
            document.removeEventListener('mousemove', widget._dragListeners.handleMouseMove);
            document.removeEventListener('mouseup', widget._dragListeners.handleMouseUp);
            
            delete widget._dragListeners;
        };
        
        // Add resize functionality
        this._makeWidgetResizable(widget, windowId);
    }
    
    /**
     * Make a widget resizable by dragging its bottom edge
     * @private
     * @param {HTMLElement} widget - The widget element
     * @param {string} windowId - The associated window ID
     */
    _makeWidgetResizable(widget, windowId) {
        const resizeHandle = widget.querySelector('.document-widget-resize-handle');
        if (!resizeHandle) return;
        
        let isResizing = false;
        let startY, startHeight;
        let rafId = null; // RequestAnimationFrame ID
        
        // Mouse down on resize handle
        const handleMouseDown = (e) => {
            // Only left mouse button
            if (e.button !== 0) return;
            
            // Start resizing
            isResizing = true;
            startY = e.clientY;
            startHeight = widget.offsetHeight;
            
            // Add resizing class for styling
            widget.classList.add('resizing');
            
            // Prevent text selection
            e.preventDefault();
        };
        
        // Mouse move for resizing
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            // Use requestAnimationFrame to throttle resize operations
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            
            rafId = requestAnimationFrame(() => {
                // Calculate new height
                const dy = e.clientY - startY;
                const newHeight = Math.max(100, startHeight + dy); // Minimum height of 100px
                
                // Apply new height
                widget.style.height = `${newHeight}px`;
                
                // Rearrange widgets to accommodate new size
                this._arrangeWidgets();
                
                rafId = null;
            });
        };
        
        // Mouse up to stop resizing
        const handleMouseUp = () => {
            if (!isResizing) return;
            
            // Cancel any pending animation frame
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            
            // Stop resizing
            isResizing = false;
            widget.classList.remove('resizing');
            
            // Final arrangement
            this._arrangeWidgets();
        };
        
        // Add event listeners
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Store event listeners for cleanup
        widget._resizeListeners = {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp
        };
        
        // Add cleanup method to widget
        widget._cleanupResizeListeners = () => {
            if (!widget._resizeListeners) return;
            
            resizeHandle.removeEventListener('mousedown', widget._resizeListeners.handleMouseDown);
            document.removeEventListener('mousemove', widget._resizeListeners.handleMouseMove);
            document.removeEventListener('mouseup', widget._resizeListeners.handleMouseUp);
            
            delete widget._resizeListeners;
        };
    }
    
    /**
     * Clean up widget event listeners before removal
     * @private
     * @param {HTMLElement} widget - The widget element to clean up
     */
    _cleanupWidget(widget) {
        if (!widget) return;
        
        // Clean up resize listeners if they exist
        if (widget._cleanupResizeListeners) {
            widget._cleanupResizeListeners();
        }
        
        // Clean up drag listeners if they exist
        if (widget._cleanupDragListeners) {
            widget._cleanupDragListeners();
        }
    }
    
    /**
     * Clean up the window manager
     * @public
     */
    cleanup() {
        // Disconnect resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // Clean up all widgets
        if (this.widgets) {
            for (const [_, widgetData] of this.widgets) {
                if (widgetData.widget) {
                    this._cleanupWidget(widgetData.widget);
                }
            }
        }
    }
}

// Create and export a singleton instance
const windowManager = new WindowManager();

// Make windowManager globally available 
window.windowManager = windowManager;

// CommonJS compatibility (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = windowManager;
} 