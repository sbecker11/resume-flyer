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
        this._setupDomReadyPromise();
    }

    getDependencies() {
        return []; // VueDomManager has no dependencies - it's foundational
    }

    getPriority() {
        return 'highest'; // Initialize as early as possible
    }

    async initialize() {
        window.CONSOLE_LOG_IGNORE('[VueDomManager] Initializing Vue DOM readiness manager...');
        
        // Wait for Vue DOM to be ready
        await this.domReadyPromise;
        
        this.isDomReady = true;
        window.CONSOLE_LOG_IGNORE('[VueDomManager] Vue DOM is ready');
    }

    destroy() {
        this.isDomReady = false;
        this.domReadyPromise = null;
    }

    /**
     * Setup the Vue DOM ready promise
     * @private
     */
    _setupDomReadyPromise() {
        if (typeof window === 'undefined') {
            // Server environment - resolve immediately
            this.domReadyPromise = Promise.resolve();
            return;
        }

        this.domReadyPromise = new Promise((resolve) => {
            const handleVueDomReady = () => {
                window.CONSOLE_LOG_IGNORE('[VueDomManager] Vue DOM ready event received');
                window.removeEventListener('vue-dom-ready', handleVueDomReady);
                resolve();
            };

            // Check if Vue DOM is already ready
            if (document.readyState === 'complete' && window.Vue) {
                window.CONSOLE_LOG_IGNORE('[VueDomManager] Vue DOM already ready');
                resolve();
            } else {
                window.CONSOLE_LOG_IGNORE('[VueDomManager] Waiting for vue-dom-ready event...');
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