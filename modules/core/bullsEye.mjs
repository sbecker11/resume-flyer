// modules/core/bullsEye.mjs
// Centralized bullsEye functionality for use by composables

let _bullsEyeElement = null;
let _isInitialized = false;
let _initializationPromise = null;

/**
 * Initialize the bullsEye system idempotently and handle race conditions.
 */
export function initialize() {
    if (_initializationPromise) {
        return _initializationPromise;
    }

    _initializationPromise = new Promise((resolve, reject) => {
        try {
            if (_isInitialized) {
                window.CONSOLE_LOG_IGNORE("bullsEye.initialize: already initialized, resolving promise.");
                resolve();
                return;
            }

            _bullsEyeElement = document.getElementById('bulls-eye');
            if (!_bullsEyeElement) {
                throw new Error("bullsEye.initialize: #bulls-eye element not found in DOM");
            }

            window.CONSOLE_LOG_IGNORE('BullsEye: Element found, setting up centering...');

            // Clear any existing inline styles
            _bullsEyeElement.style.removeProperty('top');
            _bullsEyeElement.style.removeProperty('left');
            _bullsEyeElement.style.removeProperty('transform');

            // Position at scene container center (simplified approach)
            const sceneContainerForInit = document.getElementById('scene-container');
            if (sceneContainerForInit) {
                const sceneRect = sceneContainerForInit.getBoundingClientRect();
                const centerX = sceneRect.left + sceneRect.width / 2;
                const centerY = sceneRect.top + sceneRect.height / 2;
                
                _bullsEyeElement.style.position = 'fixed';
                _bullsEyeElement.style.left = `${centerX}px`;
                _bullsEyeElement.style.top = `${centerY}px`;
                _bullsEyeElement.style.transform = 'translate(-50%, -50%)';
                _bullsEyeElement.style.zIndex = '1000';
            } else {
                throw new Error('BullsEye: Scene container not found - cannot position bullsEye');
            }

            // Force a layout recalculation
            void _bullsEyeElement.offsetHeight;

            // Verify the positioning worked
            const rect = _bullsEyeElement.getBoundingClientRect();
            const sceneContainer = document.getElementById('scene-container');
            let referenceCenter;
            
            if (sceneContainer) {
                const sceneRect = sceneContainer.getBoundingClientRect();
                referenceCenter = {
                    x: sceneRect.left + sceneRect.width / 2,
                    y: sceneRect.top + sceneRect.height / 2
                };
            } else {
                referenceCenter = {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2
                };
            }
            
            const bullsEyeCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            
            window.CONSOLE_LOG_IGNORE('BullsEye: Scene center:', referenceCenter);
            window.CONSOLE_LOG_IGNORE('BullsEye: BullsEye center:', bullsEyeCenter);
            const distance = Math.sqrt(
                Math.pow(bullsEyeCenter.x - referenceCenter.x, 2) + 
                Math.pow(bullsEyeCenter.y - referenceCenter.y, 2)
            );
            window.CONSOLE_LOG_IGNORE('BullsEye: Distance from scene center:', distance.toFixed(2) + 'px');

            // Add resize listener for recentering
            // NOTE: Temporarily disabled to let composable handle positioning
            // window.addEventListener('resize', recenterBullsEye);
            
            // Add viewport-changed listener for layout changes
            // NOTE: Temporarily disabled to let composable handle positioning
            // window.addEventListener('viewport-changed', () => {
            //     console.log('BullsEye: Viewport changed, recentering...');
            //     recenterBullsEye();
            // });

            // Layout orientation changes are now handled reactively by the composable

            _isInitialized = true;
            window.CONSOLE_LOG_IGNORE('BullsEye initialized successfully');
            resolve();
        } catch (error) {
            console.error("bullsEye.initialize: Failed to initialize", error);
            reject(error);
        }
    });

    return _initializationPromise;
}

/**
 * Returns the center position of the bullsEye element
 * @returns {Object} {x, y} coordinates relative to the viewport (window coordinates)
 */
export function getBullsEye() {
    if (!_isInitialized || !_bullsEyeElement) {
        window.CONSOLE_LOG_IGNORE('BullsEye not initialized, returning scene container center');
        
        // Get scene container center directly
        const sceneContainer = document.getElementById('scene-container');
        if (sceneContainer) {
            const sceneRect = sceneContainer.getBoundingClientRect();
            return {
                x: sceneRect.left + sceneRect.width / 2,
                y: sceneRect.top + sceneRect.height / 2
            };
        }
        
        // No fallback - scene container must exist
        throw new Error('BullsEye: Scene container not found - cannot determine position');
    }

    const rect = _bullsEyeElement.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

/**
 * Recenter the bullsEye element
 */
export function recenterBullsEye() {
    if (!_isInitialized || !_bullsEyeElement) {
        window.CONSOLE_LOG_IGNORE('BullsEye: Cannot recenter - not initialized or element not found');
        return;
    }

    window.CONSOLE_LOG_IGNORE('BullsEye: Recentering...');

    // Wait for layout transitions to complete if they're happening
    const performRecenter = () => {
        console.log('BullsEye: performRecenter called');
        
        // Clear any existing inline styles
        _bullsEyeElement.style.removeProperty('top');
        _bullsEyeElement.style.removeProperty('left');
        _bullsEyeElement.style.removeProperty('transform');

        // Get scene container center directly (simplified approach)
        const sceneContainerForRecenter = document.getElementById('scene-container');
        if (sceneContainerForRecenter) {
            // Force a layout recalculation to get accurate measurements
            void sceneContainerForRecenter.offsetHeight;
            
            const sceneRect = sceneContainerForRecenter.getBoundingClientRect();
            const centerX = sceneRect.left + sceneRect.width / 2;
            const centerY = sceneRect.top + sceneRect.height / 2;
            
            console.log('BullsEye: Positioning at scene container center:', { centerX, centerY });
            _bullsEyeElement.style.position = 'fixed';
            _bullsEyeElement.style.left = `${centerX}px`;
            _bullsEyeElement.style.top = `${centerY}px`;
            _bullsEyeElement.style.transform = 'translate(-50%, -50%)';
            _bullsEyeElement.style.zIndex = '1000';
        } else {
            throw new Error('BullsEye: Scene container not found - cannot recenter bullsEye');
        }

        // Force a layout recalculation
        void _bullsEyeElement.offsetHeight;

        // Verify the recentering worked
        const rect = _bullsEyeElement.getBoundingClientRect();
        const sceneContainer = document.getElementById('scene-container');
        let referenceCenter;
        
        if (sceneContainer) {
            const sceneRect = sceneContainer.getBoundingClientRect();
            referenceCenter = {
                x: sceneRect.left + sceneRect.width / 2,
                y: sceneRect.top + sceneRect.height / 2
            };
        } else {
            referenceCenter = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            };
        }
        
        const bullsEyeCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        
        const distance = Math.sqrt(
            Math.pow(bullsEyeCenter.x - referenceCenter.x, 2) + 
            Math.pow(bullsEyeCenter.y - referenceCenter.y, 2)
        );
        
        console.log('BullsEye: Recentered - distance from scene center:', distance.toFixed(2) + 'px');
        console.log('BullsEye: Final position verification:', {
            bullsEyeCenter,
            referenceCenter,
            distance: distance.toFixed(2)
        });
    };

    // If we're in the middle of a layout transition, wait for it to complete
    if (window.isLayoutTransitioning) {
        setTimeout(performRecenter, 100);
    } else {
        performRecenter();
    }
}

/**
 * Check if bullsEye is initialized
 * @returns {boolean} Whether bullsEye is initialized
 */
export function isInitialized() {
    return _isInitialized;
}

/**
 * Get the bullsEye DOM element
 * @returns {HTMLElement|null} The bullsEye element
 */
export function getBullsEyeElement() {
    return _bullsEyeElement;
}

/**
 * Clean up bullsEye system
 */
export function cleanup() {
    if (_isInitialized) {
        // NOTE: These listeners are disabled, but keeping cleanup for safety
        // window.removeEventListener('resize', recenterBullsEye);
        // window.removeEventListener('viewport-changed', recenterBullsEye);
        _bullsEyeElement = null;
        _isInitialized = false;
        _initializationPromise = null; // Reset initialization promise to allow re-initialization
    }
} 