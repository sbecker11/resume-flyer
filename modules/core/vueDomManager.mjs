/**
 * VueDomManager - Manages Vue DOM readiness lifecycle
 * Components that need Vue DOM can declare this as a dependency
 */

import { BaseComponent } from './abstracts/BaseComponent.mjs';

class VueDomManager extends BaseComponent {
    constructor() {
        super('VueDomManager');
        this.isDomReady = false;
        this.domReadyPromise = null;
        // DOM operations moved to setupDom() - constructor only sets up state
    }

    getDependencies() {
        return []; // VueDomManager has no dependencies - it's foundational
    }

    getPriority() {
        return 'highest'; // Initialize as early as possible
    }

    /**
     * Indicates this component is allowed to use async initialization
     * VueDomManager needs async to wait for DOM readiness events
     * @returns {boolean}
     */
    asyncAllowed() {
        return true;
    }

    async initialize() {
        console.log('[VueDomManager] Initializing Vue DOM readiness manager...');
        // Business logic only - no DOM operations here
        // DOM operations moved to setupDom()
    }

    /**
     * DOM setup phase - called after DOM is ready
     * VueDomManager manages DOM readiness itself
     */
    async setupDom() {
        console.log('[VueDomManager] DOM setup phase - setting up DOM readiness detection...');
        
        // Setup DOM readiness promise (DOM operations moved from constructor/initialize)
        this._setupDomReadyPromise();
        
        // Wait for Vue DOM to be ready (DOM operation moved from initialize)
        await this.domReadyPromise;
        
        this.isDomReady = true;
        console.log('[VueDomManager] Vue DOM is ready');
        console.log('[VueDomManager] DOM setup complete');
    }

    destroy() {
        this.isDomReady = false;
        this.domReadyPromise = null;
    }

    /**
     * Setup the Vue DOM ready promise - DOM operations now properly in setupDom phase
     * @private
     */
    _setupDomReadyPromise() {
        console.log('[VueDomManager] Setting up DOM readiness promise (DOM operations in setupDom phase)');
        
        if (typeof window === 'undefined') {
            // Server environment - resolve immediately
            console.log('[VueDomManager] Server environment detected - resolving immediately');
            this.domReadyPromise = Promise.resolve();
            return;
        }

        this.domReadyPromise = new Promise((resolve) => {
            const handleVueDomReady = () => {
                console.log('[VueDomManager] Vue DOM ready event received');
                window.removeEventListener('vue-dom-ready', handleVueDomReady);
                resolve();
            };

            // DOM state checking - now properly in setupDom phase
            if (document.readyState === 'complete' && window.Vue) {
                console.log('[VueDomManager] Vue DOM already ready');
                resolve();
            } else {
                console.log('[VueDomManager] Waiting for vue-dom-ready event...');
                // DOM event listener setup - now properly in setupDom phase
                window.addEventListener('vue-dom-ready', handleVueDomReady);
                
                // Fallback timeout in case event doesn't fire
                setTimeout(() => {
                    console.warn('[VueDomManager] Vue DOM ready timeout - assuming ready');
                    window.removeEventListener('vue-dom-ready', handleVueDomReady);
                    resolve();
                }, 10000); // 10 second timeout
            }
        });
    }

    /**
     * Check if Vue DOM is ready
     * @returns {boolean}
     */
    isReady() {
        return this.isDomReady;
    }

    /**
     * Get the DOM ready promise for manual waiting
     * @returns {Promise}
     */
    getReadyPromise() {
        return this.domReadyPromise;
    }
}

// Create singleton instance - this will auto-register with InitializationManager
export const vueDomManager = new VueDomManager();