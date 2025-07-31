// modules/core/abstracts/BaseComponent.mjs
// Minimal BaseComponent for compatibility with recovered controllers

export class BaseComponent {
    constructor(name) {
        this.name = name;
        this.isInitialized = false;
    }

    initialize() {
        this.isInitialized = true;
    }

    isReady() {
        return this.isInitialized;
    }

    getDependencies() {
        return [];
    }
}

// Vue component mixin for IM pattern compatibility
export const BaseVueComponentMixin = {
    data() {
        return {
            isComponentInitialized: false
        };
    },
    
    methods: {
        // Default method implementations that components can override
        getComponentDependencies() {
            return [];
        },
        
        initialize(dependencies = {}) {
            console.log(`[${this.$options.name}] Default initialize called`);
            this.isComponentInitialized = true;
        },
        
        async setupDom() {
            console.log(`[${this.$options.name}] Default setupDom called`);
        },
        
        cleanupDependencies() {
            console.log(`[${this.$options.name}] Default cleanup called`);
        }
    },
    
    mounted() {
        // Simulate IM initialization for now
        if (this.getComponentDependencies && this.initialize) {
            const deps = this.getComponentDependencies();
            console.log(`[${this.$options.name}] Simulating IM initialization with dependencies:`, deps);
            
            // For now, pass empty dependencies object
            // In a full IM setup, this would be handled by the IM system
            this.initialize({});
            
            // Call setupDom after initialization
            if (this.setupDom) {
                this.$nextTick(() => {
                    this.setupDom();
                });
            }
        }
    },
    
    beforeUnmount() {
        if (this.cleanupDependencies) {
            this.cleanupDependencies();
        }
    }
};