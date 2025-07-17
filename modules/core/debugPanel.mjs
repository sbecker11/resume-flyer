/**
 * Debug Panel Component
 * A proper component that registers with the initialization manager
 * and waits for all dependencies before accessing coordinate values
 */

class DebugPanel {
    constructor() {
        if (DebugPanel.instance) {
            return DebugPanel.instance;
        }
        
        this.isInitialized = false;
        this.debugValues = new Map();
        this.updateInterval = null;
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
        };
        
        DebugPanel.instance = this;
    }

    /**
     * Register this component with the initialization manager
     * Dependencies: Viewport, Layout (which ensures bullsEye and focalPoint are ready)
     */
    registerForInitialization(initializationManager) {
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Attempting to register with initialization manager');
        if (!initializationManager) {
            console.error('[DebugPanel] No initialization manager provided');
            return;
        }

        window.CONSOLE_LOG_IGNORE('[DebugPanel] Registering with initialization manager');
        initializationManager.register(
            'DebugPanel',
            async () => {
                window.CONSOLE_LOG_IGNORE('[DebugPanel] Initialization manager is calling initialize()');
                await this.initialize();
            },
            ['Viewport', 'Layout'], // Wait for these components which ensure the coordinate systems are ready
            { priority: 'low' }
        );
    }

    /**
     * Initialize the debug panel after all dependencies are ready
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        window.CONSOLE_LOG_IGNORE('[DebugPanel] Initializing debug panel');
        
        // Wait for DOM to be ready
        await new Promise(resolve => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });

        // Start updating debug values periodically
        this.updateInterval = setInterval(() => {
            this.updateDebugValues();
        }, 100); // Update every 100ms

        // Initialize drag functionality
        setTimeout(() => {
            window.CONSOLE_LOG_IGNORE('[DebugPanel] Initializing drag functionality');
            this.initializeDragFunctionality();
            this.loadDebugPanelPosition();
        }, 100); // Reduced timeout

        this.isInitialized = true;
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Debug panel initialized');
    }

    /**
     * Update all debug values - safe to call after initialization
     */
    updateDebugValues() {
        if (!this.isInitialized) {
            return;
        }

        try {
            this.updateContainerValues();
            this.updateBullsEyeValues();
            this.updateFocalPointValues();
            this.updateViewPortValues();
        } catch (error) {
            window.CONSOLE_LOG_IGNORE('[DebugPanel] Error updating debug values:', error);
        }
    }

    /**
     * Update container-related debug values
     */
    updateContainerValues() {
        // Scene container window-relative coordinates
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const sceneRect = sceneContainer.getBoundingClientRect();
            this.debugValues.set('win.scL', sceneRect.left.toFixed(1));
            this.debugValues.set('win.scW', sceneRect.width.toFixed(1));
        } else {
            this.debugValues.set('win.scL', 'N/A');
            this.debugValues.set('win.scW', 'N/A');
        }

        // Resume container window-relative coordinates
        const resumeContainer = document.getElementById('resume-container');
        if (resumeContainer) {
            const resumeRect = resumeContainer.getBoundingClientRect();
            this.debugValues.set('win.rcL', resumeRect.left.toFixed(1));
            this.debugValues.set('win.rcW', resumeRect.width.toFixed(1));
        } else {
            this.debugValues.set('win.rcL', 'N/A');
            this.debugValues.set('win.rcW', 'N/A');
        }
    }

    /**
     * Update BullsEye-related debug values
     */
    updateBullsEyeValues() {
        // Check if bullsEye composable is available (should be available globally)
        const bullsEyeComposable = window.bullsEye;
        if (bullsEyeComposable && bullsEyeComposable.position) {
            try {
                const bullsEyePosition = bullsEyeComposable.position.value;
                if (bullsEyePosition && bullsEyePosition.x !== null && bullsEyePosition.y !== null && bullsEyePosition.x !== undefined && bullsEyePosition.y !== undefined) {
                    this.debugValues.set('win.beX', bullsEyePosition.x.toFixed(1));
                    this.debugValues.set('win.beY', bullsEyePosition.y.toFixed(1));
                } else {
                    this.debugValues.set('win.beX', 'NULL');
                    this.debugValues.set('win.beY', 'NULL');
                }
            } catch (error) {
                this.debugValues.set('win.beX', 'ERROR');
                this.debugValues.set('win.beY', 'ERROR');
            }
        } else {
            this.debugValues.set('win.beX', 'N/A');
            this.debugValues.set('win.beY', 'N/A');
        }
    }

    /**
     * Update FocalPoint-related debug values
     */
    updateFocalPointValues() {
        // Check if focalPoint is available (should be available globally)
        const focalPointModule = window.focalPoint || window.focalPointModule;
        if (focalPointModule && focalPointModule.position) {
            try {
                const position = focalPointModule.position.value;
                if (position && position.x !== null && position.y !== null && position.x !== undefined && position.y !== undefined) {
                    this.debugValues.set('win.fpX', position.x.toFixed(1));
                    this.debugValues.set('win.fpY', position.y.toFixed(1));
                } else {
                    this.debugValues.set('win.fpX', 'NULL');
                    this.debugValues.set('win.fpY', 'NULL');
                }
            } catch (error) {
                this.debugValues.set('win.fpX', 'ERROR');
                this.debugValues.set('win.fpY', 'ERROR');
            }
        } else {
            this.debugValues.set('win.fpX', 'N/A');
            this.debugValues.set('win.fpY', 'N/A');
        }
    }

    /**
     * Update ViewPort-related debug values
     */
    updateViewPortValues() {
        // Get scene container center directly
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            try {
                const sceneRect = sceneContainer.getBoundingClientRect();
                
                // Scene container center X (replaces viewport center)
                const scCx = sceneRect.left + sceneRect.width / 2;
                this.debugValues.set('app.scCx', scCx.toFixed(1));
                
                // Add viewport rectangle coordinates
                const vpTop = sceneRect.top.toFixed(0);
                const vpLeft = sceneRect.left.toFixed(0);
                const vpRight = sceneRect.right.toFixed(0);
                const vpBottom = sceneRect.bottom.toFixed(0);
                this.debugValues.set('app.vpRect', `T:${vpTop} L:${vpLeft} R:${vpRight} B:${vpBottom}`);
            } catch (error) {
                this.debugValues.set('app.scCx', 'ERROR');
                this.debugValues.set('app.vpRect', 'ERROR');
            }
        } else {
            this.debugValues.set('app.scCx', 'N/A');
            this.debugValues.set('app.vpRect', 'N/A');
        }
    }

    /**
     * Get a debug value by key
     */
    getDebugValue(key) {
        return this.debugValues.get(key) || 'N/A';
    }

    /**
     * Get all debug values as an object
     */
    getAllDebugValues() {
        const values = {};
        for (const [key, value] of this.debugValues) {
            values[key] = value;
        }
        return values;
    }

    /**
     * Check if the debug panel is initialized
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Initialize drag functionality for the debug panel
     */
    initializeDragFunctionality() {
        const debugElement = document.getElementById('live-debug-display');
        if (!debugElement) {
            console.error('[DebugPanel] Error: live-debug-display element not found');
            return;
        }
        
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Setting up drag functionality on element:', debugElement);

        // Add draggable styling
        debugElement.style.cursor = 'move';
        debugElement.style.userSelect = 'none';
        debugElement.style.border = '2px dashed #ccc';
        debugElement.style.padding = '5px';
        debugElement.style.backgroundColor = 'rgba(0,0,0,0.8)';
        debugElement.style.color = 'white';
        debugElement.style.position = 'fixed';
        debugElement.style.zIndex = '9999';
        debugElement.style.pointerEvents = 'auto';
        debugElement.title = 'Click and drag to move debug panel';
        
        // Add drag event listeners
        debugElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Add touch events for mobile support
        debugElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        
        // Test event listener attachment
        debugElement.addEventListener('click', () => {
            window.CONSOLE_LOG_IGNORE('[DebugPanel] Click event received - drag listeners are attached!');
        });
        
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Event listeners attached to debug panel');
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(event) {
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Mouse down event received:', event.target, event.clientX, event.clientY);
        event.preventDefault();
        this.dragState.isDragging = true;
        this.dragState.startX = event.clientX - this.dragState.currentX;
        this.dragState.startY = event.clientY - this.dragState.currentY;
        
        const debugElement = document.getElementById('live-debug-display');
        if (debugElement) {
            debugElement.style.cursor = 'grabbing';
        }
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(event) {
        if (!this.dragState.isDragging) return;
        
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Mouse move event during drag:', event.clientX, event.clientY);
        event.preventDefault();
        this.dragState.currentX = event.clientX - this.dragState.startX;
        this.dragState.currentY = event.clientY - this.dragState.startY;
        
        this.updateDebugPanelPosition();
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp(event) {
        if (!this.dragState.isDragging) return;
        
        window.CONSOLE_LOG_IGNORE('[DebugPanel] Mouse up event received');
        this.dragState.isDragging = false;
        const debugElement = document.getElementById('live-debug-display');
        if (debugElement) {
            debugElement.style.cursor = 'move';
        }
        
        // Save position to localStorage
        this.saveDebugPanelPosition();
    }

    /**
     * Handle touch start event
     */
    handleTouchStart(event) {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.dragState.isDragging = true;
            this.dragState.startX = touch.clientX - this.dragState.currentX;
            this.dragState.startY = touch.clientY - this.dragState.currentY;
        }
    }

    /**
     * Handle touch move event
     */
    handleTouchMove(event) {
        if (!this.dragState.isDragging || event.touches.length !== 1) return;
        
        event.preventDefault();
        const touch = event.touches[0];
        this.dragState.currentX = touch.clientX - this.dragState.startX;
        this.dragState.currentY = touch.clientY - this.dragState.startY;
        
        this.updateDebugPanelPosition();
    }

    /**
     * Handle touch end event
     */
    handleTouchEnd(event) {
        if (!this.dragState.isDragging) return;
        
        this.dragState.isDragging = false;
        this.saveDebugPanelPosition();
    }

    /**
     * Update debug panel position
     */
    updateDebugPanelPosition() {
        const debugElement = document.getElementById('live-debug-display');
        if (!debugElement) return;
        
        // Allow dragging anywhere in the window - just use the current position
        // Only prevent dragging completely off-screen (allow partial off-screen)
        const minX = -debugElement.offsetWidth + 50; // Allow mostly off-screen but keep 50px visible
        const minY = -debugElement.offsetHeight + 50;
        const maxX = window.innerWidth - 50; // Allow mostly off-screen but keep 50px visible
        const maxY = window.innerHeight - 50;
        
        const clampedX = Math.max(minX, Math.min(this.dragState.currentX, maxX));
        const clampedY = Math.max(minY, Math.min(this.dragState.currentY, maxY));
        
        debugElement.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
        debugElement.style.position = 'fixed';
        debugElement.style.zIndex = '1000';
    }

    /**
     * Save debug panel position to localStorage
     */
    saveDebugPanelPosition() {
        const position = {
            x: this.dragState.currentX,
            y: this.dragState.currentY
        };
        localStorage.setItem('debugPanelPosition', JSON.stringify(position));
    }

    /**
     * Load debug panel position from localStorage
     */
    loadDebugPanelPosition() {
        try {
            const saved = localStorage.getItem('debugPanelPosition');
            if (saved) {
                const position = JSON.parse(saved);
                this.dragState.currentX = position.x || 0;
                this.dragState.currentY = position.y || 0;
                this.updateDebugPanelPosition();
            }
        } catch (error) {
            console.error('[DebugPanel] Error loading saved position:', error);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Remove event listeners
        const debugElement = document.getElementById('live-debug-display');
        if (debugElement) {
            debugElement.removeEventListener('mousedown', this.handleMouseDown);
            debugElement.removeEventListener('touchstart', this.handleTouchStart);
        }
        
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        
        this.isInitialized = false;
        this.debugValues.clear();
    }
}

// Create singleton instance
const debugPanel = new DebugPanel();

// Export for use in other modules
export default debugPanel;
export { DebugPanel };

// Make available globally
if (typeof window !== 'undefined') {
    window.debugPanel = debugPanel;
}