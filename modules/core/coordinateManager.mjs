/**
 * Centralized coordinate system manager
 * Ensures all coordinate-dependent systems stay synchronized
 */

import { BaseComponent } from './abstracts/BaseComponent.mjs';

class CoordinateManager extends BaseComponent {
    constructor() {
        super('CoordinateManager');
        this.coordinateSystems = new Map();
        this.listeners = new Set();
        // isInitialized is managed by BaseComponent
    }

    /**
     * Register a coordinate system
     * @param {string} name - Name of the coordinate system
     * @param {Object} system - The coordinate system object
     */
    registerSystem(name, system) {
        this.coordinateSystems.set(name, system);
        window.CONSOLE_LOG_IGNORE(`[COORDS] Registered coordinate system: ${name}`);
    }

    /**
     * Update all coordinate systems when layout changes
     * @param {Object} layoutInfo - Layout information
     */
    updateAllSystems(layoutInfo) {
        // BaseComponent guarantees this is only called when initialized
        window.CONSOLE_LOG_IGNORE('[COORDS] Updating all coordinate systems:', layoutInfo);
        
        // Update each registered system
        for (const [name, system] of this.coordinateSystems) {
            if (system.updateCoordinates) {
                try {
                    system.updateCoordinates(layoutInfo);
                } catch (error) {
                    window.CONSOLE_LOG_IGNORE(`[COORDS] Error updating ${name}:`, error);
                }
            }
        }

        // Notify listeners
        this.notifyListeners(layoutInfo);
    }

    /**
     * Add a listener for coordinate updates
     * @param {Function} listener - The listener function
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * Remove a listener
     * @param {Function} listener - The listener function to remove
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of coordinate changes
     * @param {Object} layoutInfo - Layout information
     */
    notifyListeners(layoutInfo) {
        for (const listener of this.listeners) {
            try {
                listener(layoutInfo);
            } catch (error) {
                window.CONSOLE_LOG_IGNORE('[COORDS] Error in coordinate listener:', error);
            }
        }
    }


    destroy() {
        this.coordinateSystems.clear();
        this.listeners.clear();
        window.CONSOLE_LOG_IGNORE('[COORDS] Coordinate manager destroyed');
    }

    /**
     * Get the status of all coordinate systems
     */
    getStatus() {
        const status = {};
        for (const [name, system] of this.coordinateSystems) {
            status[name] = {
                registered: true,
                hasUpdateMethod: !!system.updateCoordinates,
                // Don't check isInitialized - systems are guaranteed ready when registered
                systemType: system.constructor.name || 'unknown'
            };
        }
        return status;
    }

    // Required IM framework methods
    getDependencies() {
        return []; // CoordinateManager is a fundamental utility with no IM dependencies
    }

    initialize(dependencies = {}) {
        window.CONSOLE_LOG_IGNORE('[CoordinateManager] Initialized');
        // Ready to register coordinate systems
    }

    destroy() {
        this.coordinateSystems.clear();
        this.listeners.clear();
        window.CONSOLE_LOG_IGNORE('[CoordinateManager] Destroyed');
    }
}

// Export singleton instance
export const coordinateManager = new CoordinateManager(); 