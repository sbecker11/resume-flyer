/**
 * Import Parser - Automatically discovers component dependencies by analyzing import statements
 * This enables true Spring Boot-style dependency management without manual dependency declarations
 */

class ImportParser {
    constructor() {
        this.componentPaths = new Map(); // componentName -> file path
        this.importCache = new Map(); // file path -> parsed imports
        this.dependencyCache = new Map(); // componentName -> dependencies
    }

    /**
     * Register a component's file path for dependency analysis
     * @param {string} componentName - Name of the component
     * @param {string} filePath - Path to the component file
     */
    registerComponentPath(componentName, filePath) {
        this.componentPaths.set(componentName, filePath);
        // Clear caches when new components are registered
        this.dependencyCache.delete(componentName);
    }

    /**
     * Parse import statements from a JavaScript or Vue file
     * @param {string} fileContent - Content of the JavaScript or Vue file
     * @param {string} filePath - Path to the file (used to determine file type)
     * @returns {Array} - Array of import information objects
     */
    parseImports(fileContent, filePath = '') {
        const imports = [];
        
        // Handle Vue files - extract script content
        let scriptContent = fileContent;
        if (filePath.endsWith('.vue')) {
            scriptContent = this.extractVueScriptContent(fileContent);
        }
        
        // Regular expressions to match different import patterns
        const importPatterns = [
            // import { name } from 'path'
            /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g,
            // import name from 'path'
            /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g,
            // import * as name from 'path'
            /import\s*\*\s*as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(scriptContent)) !== null) {
                const importPath = match[2];
                const importedNames = match[1].split(',').map(name => name.trim());
                
                imports.push({
                    path: importPath,
                    names: importedNames,
                    type: this.getImportType(pattern, match[0])
                });
            }
        }

        return imports;
    }

    /**
     * Extract script content from Vue single file component
     * @private
     */
    extractVueScriptContent(vueContent) {
        // Match <script> or <script setup> tags and extract content
        const scriptTagRegex = /<script[^>]*>([\s\S]*?)<\/script>/i;
        const match = vueContent.match(scriptTagRegex);
        
        if (match && match[1]) {
            return match[1];
        }
        
        // If no script tag found, return empty string
        console.warn('[ImportParser] No <script> tag found in Vue file');
        return '';
    }

    /**
     * Determine the type of import based on the pattern
     * @private
     */
    getImportType(pattern, matchString) {
        if (matchString.includes('{')) return 'named';
        if (matchString.includes('* as')) return 'namespace';
        return 'default';
    }

    /**
     * Convert import path to component name
     * @param {string} importPath - The import path
     * @returns {string|null} - Component name or null if not a component
     */
    pathToComponentName(importPath) {
        // Skip non-component imports
        if (importPath.startsWith('node_modules') || 
            importPath.startsWith('@') ||
            importPath.includes('node_modules') ||
            !importPath.includes('/')) {
            return null;
        }

        // Extract component name from path
        // Examples:
        // '../core/selectionManager.mjs' -> 'SelectionManager'
        // './badgeManager.mjs' -> 'BadgeManager'
        // '../scene/CardsController.mjs' -> 'CardsController'
        
        const fileName = importPath.split('/').pop(); // Get filename
        const baseName = fileName.replace(/\.(mjs|js|ts|vue)$/, ''); // Remove extension
        
        // Convert to PascalCase component name
        return this.toPascalCase(baseName);
    }

    /**
     * Convert string to PascalCase
     * @private
     */
    toPascalCase(str) {
        return str
            .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
            .replace(/^./, char => char.toUpperCase());
    }

    /**
     * Get dependencies for a component by analyzing its imports
     * @param {string} componentName - Name of the component
     * @returns {Promise<Array<string>>} - Array of dependency component names
     */
    async getDependencies(componentName) {
        // Check cache first
        if (this.dependencyCache.has(componentName)) {
            return this.dependencyCache.get(componentName);
        }

        const filePath = this.componentPaths.get(componentName);
        if (!filePath) {
            console.warn(`[ImportParser] No file path registered for component: ${componentName}`);
            return [];
        }

        try {
            // Read file content
            const fileContent = await this.readFile(filePath);
            
            // Parse imports
            const imports = this.parseImports(fileContent, filePath);
            
            // Convert imports to component dependencies
            const dependencies = new Set();
            
            for (const importInfo of imports) {
                const dependencyName = this.pathToComponentName(importInfo.path);
                if (dependencyName && dependencyName !== componentName) {
                    // Check if the imported names suggest this is a component dependency
                    if (this.isComponentImport(importInfo, dependencyName)) {
                        dependencies.add(dependencyName);
                    }
                }
            }

            const dependencyArray = Array.from(dependencies);
            
            // Cache the result
            this.dependencyCache.set(componentName, dependencyArray);
            
            window.CONSOLE_LOG_IGNORE(`[ImportParser] Auto-discovered dependencies for ${componentName}:`, dependencyArray);
            
            return dependencyArray;
            
        } catch (error) {
            console.error(`[ImportParser] Failed to analyze dependencies for ${componentName}:`, error);
            return [];
        }
    }

    /**
     * Check if an import represents a component dependency
     * @private
     */
    isComponentImport(importInfo, dependencyName) {
        // If importing the component name directly (like 'selectionManager')
        const camelCaseName = dependencyName.charAt(0).toLowerCase() + dependencyName.slice(1);
        
        if (importInfo.names.some(name => 
            name === camelCaseName || 
            name === dependencyName ||
            name.toLowerCase().includes(dependencyName.toLowerCase())
        )) {
            return true;
        }

        // If it's a path that looks like a component module
        if (importInfo.path.includes('core/') || 
            importInfo.path.includes('scene/') ||
            importInfo.path.includes('resume/') ||
            importInfo.path.includes('Manager') ||
            importInfo.path.includes('Controller')) {
            return true;
        }

        return false;
    }

    /**
     * Read file content (browser-compatible version)
     * @private
     */
    async readFile(filePath) {
        // In browser environment, we need to fetch the file
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            // Fallback: if we can't read the file, return empty string
            console.warn(`[ImportParser] Could not read file ${filePath}:`, error);
            return '';
        }
    }

    /**
     * Get all registered components and their dependencies
     * @returns {Promise<Object>} - Map of component names to their dependencies
     */
    async getAllDependencies() {
        const allDependencies = {};
        
        for (const [componentName] of this.componentPaths) {
            allDependencies[componentName] = await this.getDependencies(componentName);
        }
        
        return allDependencies;
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.importCache.clear();
        this.dependencyCache.clear();
    }

    /**
     * Get debugging information
     */
    getDebugInfo() {
        return {
            registeredComponents: Array.from(this.componentPaths.keys()),
            cachedDependencies: Object.fromEntries(this.dependencyCache),
            componentPaths: Object.fromEntries(this.componentPaths)
        };
    }
}

// Create and export singleton instance
export const importParser = new ImportParser();

// Export the class for testing
export { ImportParser };