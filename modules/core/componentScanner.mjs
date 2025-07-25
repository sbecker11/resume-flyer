/**
 * Component Scanner - Finds components that haven't registered with dependency system
 * Analyzes source code and runtime behavior to enforce compliance
 */

import { initializationManager } from './initializationManager.mjs';
import { promises as fs } from 'fs';
import path from 'path';

export class ComponentScanner {
    constructor() {
        this.foundComponents = new Map();
        this.registeredComponents = new Set();
        this.violatingComponents = new Set();
        this.scanResults = null;
    }

    /**
     * Scan project files for components using managers without registration
     */
    async scanProject(projectRoot = '.') {
        console.log('🔍 Scanning project for unregistered components...');
        
        const results = {
            scannedFiles: 0,
            foundComponents: [],
            violatingComponents: [],
            managerUsage: new Map(),
            recommendations: []
        };

        try {
            await this._scanDirectory(projectRoot, results);
            await this._analyzeResults(results);
            
            this.scanResults = results;
            return results;
            
        } catch (error) {
            console.error('❌ Component scan failed:', error);
            throw error;
        }
    }

    /**
     * Recursively scan directory for component files
     */
    async _scanDirectory(dirPath, results) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory() && !this._shouldSkipDirectory(entry.name)) {
                    await this._scanDirectory(fullPath, results);
                } else if (entry.isFile() && this._isComponentFile(entry.name)) {
                    await this._scanFile(fullPath, results);
                }
            }
        } catch (error) {
            console.warn(`⚠️ Could not scan directory ${dirPath}:`, error.message);
        }
    }

    /**
     * Check if directory should be skipped
     */
    _shouldSkipDirectory(name) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '.nuxt', '.output'];
        return skipDirs.includes(name);
    }

    /**
     * Check if file is likely a component
     */
    _isComponentFile(filename) {
        const extensions = ['.vue', '.mjs', '.js', '.ts'];
        const componentPatterns = ['Component', 'Controller', 'Manager', 'Service'];
        const excludePatterns = ['BaseComponent', 'Abstract']; // Exclude abstract base classes
        
        const hasExtension = extensions.some(ext => filename.endsWith(ext));
        const hasPattern = componentPatterns.some(pattern => filename.includes(pattern));
        const isExcluded = excludePatterns.some(pattern => filename.includes(pattern));
        
        return hasExtension && (hasPattern || filename.endsWith('.vue')) && !isExcluded;
    }

    /**
     * Analyze individual file for component patterns
     */
    async _scanFile(filePath, results) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            results.scannedFiles++;

            const analysis = this._analyzeFileContent(content, filePath);
            
            if (analysis.isComponent) {
                results.foundComponents.push({
                    file: filePath,
                    name: analysis.componentName,
                    type: analysis.componentType,
                    usesManagers: analysis.usesManagers,
                    isRegistered: analysis.isRegistered,
                    violations: analysis.violations
                });

                // Track manager usage
                analysis.usesManagers.forEach(manager => {
                    if (!results.managerUsage.has(manager)) {
                        results.managerUsage.set(manager, []);
                    }
                    results.managerUsage.get(manager).push({
                        file: filePath,
                        component: analysis.componentName,
                        registered: analysis.isRegistered
                    });
                });

                // Track violations
                if (analysis.violations.length > 0) {
                    results.violatingComponents.push({
                        file: filePath,
                        name: analysis.componentName,
                        violations: analysis.violations
                    });
                }
            }

        } catch (error) {
            console.warn(`⚠️ Could not scan file ${filePath}:`, error.message);
        }
    }

    /**
     * Analyze file content for component patterns
     */
    _analyzeFileContent(content, filePath) {
        const analysis = {
            isComponent: false,
            componentName: filePath.endsWith('.vue') ? path.basename(filePath) : path.basename(filePath, path.extname(filePath)),
            componentType: 'unknown',
            usesManagers: [],
            isRegistered: false,
            violations: []
        };

        // Detect component type
        if (filePath.endsWith('.vue')) {
            analysis.componentType = 'vue';
            analysis.isComponent = true;
        } else if (content.includes('class ') && content.includes('Component')) {
            analysis.componentType = 'class';
            analysis.isComponent = true;
        } else if (content.includes('Controller') || content.includes('Manager')) {
            analysis.componentType = 'class';
            analysis.isComponent = true;
        }

        if (!analysis.isComponent) return analysis;

        // Check for manager imports/usage
        const managerPatterns = [
            // Only detect actual usage, not side-effect imports
            { name: 'selectionManager', pattern: /selectionManager\./g },
            { name: 'badgeManager', pattern: /badgeManager\./g },
            { name: 'initializationManager', pattern: /initializationManager\./g },
            { name: 'eventBus', pattern: /eventBus\./g }
        ];

        managerPatterns.forEach(({ name, pattern }) => {
            if (pattern.test(content)) {
                analysis.usesManagers.push(name);
            }
        });

        // Check for registration with InitializationManager
        const registrationPatterns = [
            /initializationManager\\.register/,
            /registerForInitialization/,
            /extends BaseComponent/,
            /BaseVueComponentMixin/
        ];

        analysis.isRegistered = registrationPatterns.some(pattern => pattern.test(content));

        // Check for violations
        if (analysis.usesManagers.length > 0 && !analysis.isRegistered) {
            analysis.violations.push(`Uses managers ${analysis.usesManagers.join(', ')} but not registered with InitializationManager`);
        }

        if (analysis.componentType === 'vue' && analysis.usesManagers.length > 0) {
            // Check for initialize method with dependencies parameter (must be synchronous)
            const hasInitializeMethod = /(?<!async\s+)initialize\s*\(\s*dependencies\s*\)/.test(content);
            if (!hasInitializeMethod) {
                analysis.violations.push('Vue component missing initialize(dependencies) method');
            }
        }

        if (analysis.componentType === 'class' && analysis.usesManagers.length > 0) {
            if (!content.includes('extends BaseComponent')) {
                analysis.violations.push('Class component should extend BaseComponent');
            }
        }

        // Check for custom isInitialized getter implementations (conflicts with BaseComponent's getter)
        if (content.includes('get isInitialized()')) {
            analysis.violations.push('Components should not implement custom isInitialized getter - BaseComponent provides this');
        }

        // Check for manual isInitialized assignments (BaseComponent handles this automatically)
        if (content.includes('this.isInitialized = true') || content.includes('this.isInitialized = false')) {
            analysis.violations.push('Components should not manually set this.isInitialized - BaseComponent manages this automatically');
        }

        // Check for private _isInitialized properties (should use BaseComponent's)
        if (content.includes('_isInitialized = false') || content.includes('_isInitialized = true') || content.includes('this._isInitialized')) {
            analysis.violations.push('Components should not implement private _isInitialized - BaseComponent manages initialization state');
        }

        // Check for getIsInitialized method (deprecated pattern)
        if (content.includes('getIsInitialized')) {
            analysis.violations.push('getIsInitialized() method is deprecated - use component.isInitialized property instead');
        }

        // Check for manual isInitialized checks on dependencies (IM guarantees readiness)
        if (/\w+\.isInitialized\(\)|\.isInitialized\s*&&|\.isInitialized\s*\?/.test(content)) {
            analysis.violations.push('Components should not check dependency.isInitialized - IM framework guarantees dependencies are ready');
        }

        // 🛡️ NEW: Check for deprecated direct method calls on modules
        const deprecatedCalls = [
            { pattern: /viewPort\.initialize\(\)/, message: 'viewPort.initialize() is deprecated - let InitializationManager handle initialization' },
            { pattern: /viewPortModule\.initialize\(\)/, message: 'viewPortModule.initialize() is deprecated - let InitializationManager handle initialization' },
            { pattern: /bullsEye\.initialize\(\)/, message: 'bullsEye.initialize() is deprecated - let InitializationManager handle initialization' },
            { pattern: /sceneContainer\.initialize\(\)/, message: 'sceneContainer.initialize() is deprecated - let InitializationManager handle initialization' }
        ];

        deprecatedCalls.forEach(({ pattern, message }) => {
            if (pattern.test(content)) {
                analysis.violations.push(message);
            }
        });

        // 🛡️ NEW: Check for duplicate DOM element creation
        const domElementPatterns = [
            { pattern: /#aim-point.*createElement|createElement.*aim-point/i, element: 'aim-point' },
            { pattern: /#focal-point.*createElement|createElement.*focal-point/i, element: 'focal-point' },
            { pattern: /#scene-container.*createElement|createElement.*scene-container/i, element: 'scene-container' },
            { pattern: /#bulls-eye.*createElement|createElement.*bulls-eye/i, element: 'bulls-eye' }
        ];

        domElementPatterns.forEach(({ pattern, element }) => {
            if (pattern.test(content)) {
                analysis.violations.push(`Dynamic creation of #${element} element detected - may cause duplicates. Use single template definition.`);
            }
        });

        // 🛡️ NEW: Check for old IM component + new composable conflicts
        const componentConflicts = [
            { 
                oldPattern: /modules\/core\/aimPoint/,
                newPattern: /useAimPoint/,
                message: 'Both old aimPoint.mjs component and new useAimPoint composable detected - remove old component'
            },
            {
                oldPattern: /modules\/core\/focalPointManager/,
                newPattern: /useFocalPoint/,  
                message: 'Both old focalPointManager.mjs component and new useFocalPoint composable detected - remove old component'
            }
        ];

        componentConflicts.forEach(({ oldPattern, newPattern, message }) => {
            if (oldPattern.test(content) && newPattern.test(content)) {
                analysis.violations.push(message);
            }
        });

        // 🛡️ NEW: Check for browser-specific code in server.mjs
        if (filePath.endsWith('server.mjs')) {
            const serverViolations = [
                { pattern: /window\./, message: 'server.mjs should not reference window object - this is browser-specific code' },
                { pattern: /document\./, message: 'server.mjs should not reference document object - this is browser-specific code' },
                { pattern: /window\.CONSOLE_LOG_IGNORE/, message: 'server.mjs should not use window.CONSOLE_LOG_IGNORE - use console.log instead' },
                { pattern: /localStorage\./, message: 'server.mjs should not reference localStorage - this is browser-specific code' },
                { pattern: /sessionStorage\./, message: 'server.mjs should not reference sessionStorage - this is browser-specific code' }
            ];

            serverViolations.forEach(({ pattern, message }) => {
                if (pattern.test(content)) {
                    analysis.violations.push(message);
                }
            });
        }

        // 🛡️ NEW: Check for getElementById usage on stateful components (should use dependency injection)
        const statefulElementAccess = [
            { pattern: /getElementById\(['"]scene-container['"]\)/, element: 'scene-container', suggestion: 'useSceneContainer composable' },
            { pattern: /getElementById\(['"]aim-point['"]\)/, element: 'aim-point', suggestion: 'useAimPoint composable' },
            { pattern: /getElementById\(['"]focal-point['"]\)/, element: 'focal-point', suggestion: 'useFocalPoint composable' },
            { pattern: /getElementById\(['"]bulls-eye['"]\)/, element: 'bulls-eye', suggestion: 'useBullsEye composable' }
        ];

        statefulElementAccess.forEach(({ pattern, element, suggestion }) => {
            if (pattern.test(content)) {
                analysis.violations.push(`Using getElementById('${element}') bypasses IM dependency system - use import * as UseSceneContainer from "useSceneContainer.vue" and cache the reference provided from initialize(dependencies) instead`);
            }
        });


        // 🛡️ NEW: Check for async anti-patterns (IM handles all async coordination)
        const asyncAntiPatterns = [
            { 
                pattern: /async\s+initialize\s*\(/, 
                message: 'Component initialize() method should not be async - IM handles all async coordination',
                skipIf: /asyncAllowed[\s\S]*?return\s+true/ // Skip if component explicitly allows async
            },
            { pattern: /await\s+.*\.initialize\(\)/, message: 'Components should not await other component initialization - declare as IM dependency instead' },
            { pattern: /setTimeout\s*\(.*initialize/, message: 'Components should not use setTimeout for initialization - use IM dependency declaration instead' },
            { pattern: /setInterval\s*\(.*initialize/, message: 'Components should not use setInterval for initialization - use IM dependency declaration instead' },
            { pattern: /Promise\.resolve\(\)\.then\(.*initialize/, message: 'Components should not use Promise.then for initialization - use IM dependency declaration instead' },
            { pattern: /new Promise\(.*resolve.*initialize/, message: 'Components should not create Promises for initialization - use IM dependency declaration instead' },
            { pattern: /nextTick\(.*initialize/, message: 'Components should not use nextTick for initialization - use IM dependency declaration instead' },
            { pattern: /requestAnimationFrame\(.*initialize/, message: 'Components should not use requestAnimationFrame for initialization - use IM dependency declaration instead' }
        ];

        asyncAntiPatterns.forEach(({ pattern, message, skipIf }) => {
            if (pattern.test(content)) {
                // Check if this violation should be skipped
                if (skipIf && skipIf.test(content)) {
                    // Skip this violation - component explicitly allows this pattern
                    return;
                }
                
                // Alternative check: look for asyncAllowed method that returns true
                if (content.includes('asyncAllowed') && content.includes('return true')) {
                    // Skip this violation - component explicitly allows async
                    return;
                }
                
                analysis.violations.push(message);
            }
        });

        // 🛡️ NEW: Check for manual dependency waiting patterns
        const dependencyWaitingPatterns = [
            { pattern: /while\s*\(.*\.isInitialized/, message: 'Components should not poll for dependency readiness - use IM dependency declaration instead' },
            { pattern: /if\s*\(.*\.isInitialized.*\)\s*{.*initialize/, message: 'Components should not conditionally initialize based on dependency state - use IM dependency declaration instead' },
            { 
                pattern: /waitFor.*Component/, 
                message: 'Components should not manually wait for other components - use IM dependency declaration instead',
                skipIf: /asyncAllowed[\s\S]*?return\s+true/ // Skip if component explicitly allows async coordination
            },
            { pattern: /retry.*initialize/, message: 'Components should not implement retry logic for initialization - IM handles initialization order' },
            { pattern: /\.then\(\s*\(\)\s*=>\s*.*\.initialize/, message: 'Components should not chain initialization calls - use IM dependency declaration instead' }
        ];

        dependencyWaitingPatterns.forEach(({ pattern, message, skipIf }) => {
            if (pattern.test(content)) {
                // Check if this violation should be skipped
                if (skipIf && skipIf.test(content)) {
                    // Skip this violation - component explicitly allows this pattern
                    return;
                }
                
                // Alternative check: look for asyncAllowed method that returns true
                if (content.includes('asyncAllowed') && content.includes('return true')) {
                    // Skip this violation - component explicitly allows async coordination
                    return;
                }
                
                analysis.violations.push(message);
            }
        });

        // 🛡️ NEW: Check for manual timing/delay patterns in components
        const timingAntiPatterns = [
            { pattern: /setTimeout.*\d+.*initialize/, message: 'Components should not use timeouts for initialization timing - IM ensures proper order' },
            { pattern: /delay.*initialize/, message: 'Components should not implement delays for initialization - IM handles timing' },
            { pattern: /sleep.*initialize/, message: 'Components should not use sleep/delay for initialization - IM handles timing' },
            { pattern: /wait.*\d+.*ms.*initialize/, message: 'Components should not implement manual waits for initialization - IM handles timing' }
        ];

        timingAntiPatterns.forEach(({ pattern, message }) => {
            if (pattern.test(content)) {
                analysis.violations.push(message);
            }
        });

        // 🛡️ FIXED: DOM Access During Initialization Detection with proper method boundary parsing

        // Check for DOM access violations with proper method boundary parsing
        const initializeMethodContent = this._extractMethodBody(content, 'initialize');
        const setupDomMethodContent = this._extractMethodBody(content, 'setupDom');
        
        // Only check DOM violations if we successfully extracted initialize method
        if (initializeMethodContent) {
            const domChecks = [
                { pattern: /getElementById\(/, type: 'dom-in-init', severity: 'critical', message: 'DOM access in initialize() method - needs DOM separation' },
                { pattern: /querySelector\(/, type: 'dom-in-init', severity: 'critical', message: 'DOM query in initialize() method - needs DOM separation' },
                { pattern: /\.getBoundingClientRect\(\)/, type: 'dom-geometry-in-init', severity: 'critical', message: 'DOM geometry calculation in initialize() - needs DOM separation' },
                { pattern: /\.style\./, type: 'dom-styling-in-init', severity: 'high', message: 'DOM styling in initialize() - move to setupDom() phase' },
                { pattern: /\.addEventListener\(/, type: 'dom-events-in-init', severity: 'high', message: 'DOM event binding in initialize() - move to setupDom() phase' },
                { pattern: /\.(offsetWidth|offsetHeight|clientWidth|clientHeight)/, type: 'dom-dimensions-in-init', severity: 'critical', message: 'DOM dimension access in initialize() - needs DOM separation' }
            ];
            
            domChecks.forEach(({ pattern, type, severity, message }) => {
                if (pattern.test(initializeMethodContent)) {
                    analysis.violations.push({
                        type,
                        severity,
                        message,
                        autoFixable: true
                    });
                }
            });
        }

        // Check if component needs setupDom() method
        const needsSetupDom = initializeMethodContent && (
            /getElementById\(/.test(initializeMethodContent) ||
            /querySelector\(/.test(initializeMethodContent) ||
            /\.getBoundingClientRect\(\)/.test(initializeMethodContent) ||
            /\.style\./.test(initializeMethodContent) ||
            /\.addEventListener\(/.test(initializeMethodContent) ||
            /\.(offsetWidth|offsetHeight|clientWidth|clientHeight)/.test(initializeMethodContent)
        );
        const hasSetupDom = /setupDom\s*\(\s*\)/m.test(content);

        if (needsSetupDom && !hasSetupDom) {
            analysis.violations.push({
                type: 'missing-setup-dom',
                severity: 'critical',
                message: 'Component needs setupDom() method for DOM separation',
                autoFixable: true
            });
        }

        // Check for template ref injection needs
        const needsTemplateRef = /getElementById\(['"][\w-]+['"]\)/g.test(content);
        const hasTemplateRefMethod = /set\w+Element\s*\(/m.test(content);

        if (needsTemplateRef && !hasTemplateRefMethod) {
            analysis.violations.push({
                type: 'needs-template-ref',
                severity: 'medium', 
                message: 'Replace getElementById with template ref injection',
                autoFixable: true
            });
        }

        // Check for missing setupDom() calls in AppContent.vue
        if (filePath.includes('AppContent.vue') && hasSetupDom) {
            const hasSetupDomCall = /setupDom\(\)/m.test(content);
            if (!hasSetupDomCall) {
                analysis.violations.push({
                    type: 'missing-setup-dom-call',
                    severity: 'critical',
                    message: 'AppContent.vue needs to call component.setupDom() after IM initialization',
                    autoFixable: true
                });
            }
        }

        return analysis;
    }

    /**
     * Analyze scan results and generate recommendations
     */
    async _analyzeResults(results) {
        console.log(`📊 Scan complete: ${results.scannedFiles} files, ${results.foundComponents.length} components`);

        // Generate recommendations
        results.violatingComponents.forEach(component => {
            component.violations.forEach(violation => {
                results.recommendations.push({
                    file: component.file,
                    component: component.name,
                    issue: violation,
                    fix: this._getFixRecommendation(violation)
                });
            });
        });

        // Summary statistics
        const unregisteredCount = results.violatingComponents.length;
        const totalComponents = results.foundComponents.length;
        const complianceRate = totalComponents > 0 ? ((totalComponents - unregisteredCount) / totalComponents * 100).toFixed(1) : 100;

        console.log(`📈 Compliance rate: ${complianceRate}% (${totalComponents - unregisteredCount}/${totalComponents} components compliant)`);

        if (unregisteredCount > 0) {
            console.warn(`⚠️  Found ${unregisteredCount} non-compliant components`);
        }
    }

    /**
     * Extract method body content with proper brace matching
     * @param {string} content - Full file content
     * @param {string} methodName - Name of method to extract (e.g. 'initialize')
     * @returns {string|null} Method body content or null if not found
     */
    _extractMethodBody(content, methodName) {
        // Match method declaration with various patterns
        const methodPatterns = [
            new RegExp(`${methodName}\\s*\\([^)]*\\)\\s*\\{`, 'g'), // initialize() {
            new RegExp(`async\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{`, 'g'), // async initialize() {
        ];
        
        for (const pattern of methodPatterns) {
            const match = pattern.exec(content);
            if (!match) continue;
            
            // Find the opening brace position
            const openBraceIndex = match.index + match[0].length - 1;
            
            // Find matching closing brace with proper nesting
            let braceCount = 1;
            let currentIndex = openBraceIndex + 1;
            
            while (currentIndex < content.length && braceCount > 0) {
                const char = content[currentIndex];
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                }
                currentIndex++;
            }
            
            if (braceCount === 0) {
                // Extract method body (without the braces)
                const methodBody = content.substring(openBraceIndex + 1, currentIndex - 1);
                return methodBody.trim();
            }
        }
        
        return null;
    }

    /**
     * Get fix recommendation for violation
     */
    _getFixRecommendation(violation) {
        // Handle both old string violations and new object violations
        const violationText = typeof violation === 'string' ? violation : violation.message || violation.toString();
        
        if (violationText.includes('not registered')) {
            return 'Add component registration with InitializationManager or extend BaseComponent';
        }
        if (violationText.includes('missing initialize(dependencies) method')) {
            return 'Add initialize method: initialize(dependencies) { /* and save references */ self.component1 = dependencies.component1; }';
        }
        if (violationText.includes('extends BaseComponent')) {
            return 'Change class to extend BaseComponent instead of base class';
        }
        if (violationText.includes('custom isInitialized getter')) {
            return 'Remove custom isInitialized getter - BaseComponent provides isInitialized property automatically';
        }
        if (violationText.includes('manually set this.isInitialized')) {
            return 'Remove manual this.isInitialized assignments - BaseComponent sets this automatically after initialize() completes';
        }
        if (violationText.includes('private _isInitialized')) {
            return 'Remove private _isInitialized property - use BaseComponent\'s this.isInitialized instead';
        }
        if (violationText.includes('getIsInitialized')) {
            return 'Replace getIsInitialized() method with component.isInitialized property access';
        }
        if (violationText.includes('dependency.isInitialized')) {
            return 'Remove dependency.isInitialized checks - IM framework guarantees dependencies are ready when initialize() is called';
        }
        
        // 🛡️ NEW: Fix recommendations for new violation types
        if (violationText.includes('viewPort.initialize() is deprecated')) {
            return 'Remove viewPort.initialize() call - let InitializationManager handle initialization through dependencies';
        }
        if (violationText.includes('viewPortModule.initialize() is deprecated')) {
            return 'Remove viewPortModule.initialize() call - let InitializationManager handle initialization through dependencies';
        }
        if (violationText.includes('bullsEye.initialize() is deprecated')) {
            return 'Remove bullsEye.initialize() call - let InitializationManager handle initialization through dependencies';
        }
        if (violationText.includes('sceneContainer.initialize() is deprecated')) {
            return 'Remove sceneContainer.initialize() call - let InitializationManager handle initialization through dependencies';
        }
        if (violationText.includes('Dynamic creation of') && violationText.includes('element detected')) {
            return 'Remove dynamic DOM element creation - use single template definition to prevent duplicates';
        }
        if (violationText.includes('Both old') && violationText.includes('component and new') && violationText.includes('composable detected')) {
            return 'Remove old IM component file - use only the new composable to prevent conflicts';
        }
        
        // 🛡️ NEW: Fix recommendations for async anti-patterns
        if (violationText.includes('initialize() method should not be async')) {
            return 'Remove async keyword from initialize() method - make it synchronous and let IM handle async coordination';
        }
        if (violationText.includes('should not await other component initialization')) {
            return 'Remove await calls for component initialization - add component as IM dependency instead: getDependencies() { return ["ComponentName"]; }';
        }
        if (violationText.includes('should not use setTimeout for initialization')) {
            return 'Remove setTimeout - declare timing dependencies through IM dependency system instead';
        }
        if (violationText.includes('should not use setInterval for initialization')) {
            return 'Remove setInterval - declare dependencies through IM system and use proper lifecycle methods instead';
        }
        if (violationText.includes('should not use Promise.then for initialization')) {
            return 'Remove Promise.then chains - declare dependencies through IM system instead';
        }
        if (violationText.includes('should not create Promises for initialization')) {
            return 'Remove Promise creation - let IM handle all async coordination through dependency declarations';
        }
        if (violationText.includes('should not use nextTick for initialization')) {
            return 'Remove nextTick - declare VueDomManager dependency if DOM access needed, or other component dependencies as needed';
        }
        if (violationText.includes('should not use requestAnimationFrame for initialization')) {
            return 'Remove requestAnimationFrame - declare proper component dependencies through IM system instead';
        }
        if (violationText.includes('should not poll for dependency readiness')) {
            return 'Remove polling loops - declare component as dependency: getDependencies() { return ["DependencyName"]; }';
        }
        if (violationText.includes('should not conditionally initialize based on dependency state')) {
            return 'Remove conditional initialization - declare dependency through IM and initialize() will only be called when dependency is ready';
        }
        if (violationText.includes('should not manually wait for other components')) {
            return 'Remove manual waiting - declare component as IM dependency instead';
        }
        if (violationText.includes('should not implement retry logic for initialization')) {
            return 'Remove retry logic - IM ensures dependencies are ready before calling initialize()';
        }
        if (violationText.includes('should not chain initialization calls')) {
            return 'Remove initialization chains - declare dependencies through IM dependency system instead';
        }
        if (violationText.includes('should not use timeouts for initialization timing')) {
            return 'Remove timeouts - IM handles proper initialization timing through dependency resolution';
        }
        if (violationText.includes('should not implement delays for initialization')) {
            return 'Remove delays - declare proper dependencies and let IM handle timing';
        }
        if (violationText.includes('should not use sleep/delay for initialization')) {
            return 'Remove sleep/delay calls - use IM dependency declarations for proper sequencing';
        }
        if (violationText.includes('should not implement manual waits for initialization')) {
            return 'Remove manual waits - declare dependencies through IM system instead';
        }
        if (violationText.includes('bypasses IM dependency system')) {
            return 'Replace getElementById with dependency injection - import composable and cache reference from initialize(dependencies) parameter';
        }

        // 🛡️ NEW: Fix recommendations for DOM separation violations
        if (violationText.includes('DOM access in initialize() method')) {
            return 'Move DOM operations from initialize() to new setupDom() method';
        }
        if (violationText.includes('DOM query in initialize() method')) {
            return 'Move querySelector calls from initialize() to setupDom() method';
        }
        if (violationText.includes('DOM geometry calculation in initialize()')) {
            return 'Move getBoundingClientRect() calls from initialize() to setupDom() method';
        }
        if (violationText.includes('DOM styling in initialize()')) {
            return 'Move style modifications from initialize() to setupDom() method';
        }
        if (violationText.includes('DOM event binding in initialize()')) {
            return 'Move addEventListener calls from initialize() to setupDom() method';
        }
        if (violationText.includes('DOM dimension access in initialize()')) {
            return 'Move offsetWidth/offsetHeight access from initialize() to setupDom() method';
        }
        if (violationText.includes('needs setupDom() method')) {
            return 'Add setupDom() method and move DOM operations from initialize()';
        }
        if (violationText.includes('Replace getElementById with template ref injection')) {
            return 'Add setElementName(element) method and use template ref injection instead of getElementById';
        }
        if (violationText.includes('needs to call component.setupDom()')) {
            return 'Add await component.setupDom() calls in AppContent.vue after IM initialization';
        }
        
        return 'Follow dependency management guidelines';
    }

    /**
     * Generate detailed report
     */
    generateReport() {
        if (!this.scanResults) {
            throw new Error('Must run scanProject() first');
        }

        const { foundComponents, violatingComponents, managerUsage, recommendations } = this.scanResults;

        let report = `
# Component Dependency Compliance Report

## Summary
- **Total Components**: ${foundComponents.length}
- **Compliant Components**: ${foundComponents.length - violatingComponents.length}
- **Violating Components**: ${violatingComponents.length}
- **Compliance Rate**: ${foundComponents.length > 0 ? ((foundComponents.length - violatingComponents.length) / foundComponents.length * 100).toFixed(1) : 100}%

## Violating Components
`;

        violatingComponents.forEach(component => {
            report += `
### ${component.name} (${component.file})
${component.violations.map(v => `- ❌ ${v}`).join('\\n')}
`;
        });

        report += `
## Manager Usage Analysis
`;
        for (const [manager, usage] of managerUsage) {
            const unregistered = usage.filter(u => !u.registered);
            report += `
### ${manager}
- **Total Usage**: ${usage.length} components
- **Unregistered**: ${unregistered.length} components
${unregistered.length > 0 ? unregistered.map(u => `  - ${u.component} (${u.file})`).join('\\n') : ''}
`;
        }

        report += `
## Recommendations
`;
        recommendations.forEach((rec, index) => {
            report += `
${index + 1}. **${rec.component}** - ${rec.issue}
   - File: ${rec.file}
   - Fix: ${rec.fix}
`;
        });

        return report;
    }

    /**
     * Enforce compliance - throw error if violations found
     */
    enforceCompliance() {
        if (!this.scanResults) {
            throw new Error('Must run scanProject() first');
        }

        const { violatingComponents } = this.scanResults;

        if (violatingComponents.length > 0) {
            const violationList = violatingComponents.map(c => 
                `  - ${c.name} (${c.file}): ${c.violations.join(', ')}`
            ).join('\\n');

            throw new Error(`❌ FATAL: Found ${violatingComponents.length} components violating dependency management requirements:

${violationList}

ALL components using managers MUST:
1. Register with InitializationManager
2. Define dependencies properly
3. Follow initialization patterns

Run generateReport() for detailed fix instructions.`);
        }

        console.log('✅ All components are compliant with dependency management requirements');
        return true;
    }

    // ========================================================================
    // DOM SEPARATION AUTO-MIGRATION METHODS
    // ========================================================================

    /**
     * Generate DOM separation migration plan for a component
     * @param {string} filePath - Path to the component file
     * @returns {Object|null} Migration plan or null if no migration needed
     */
    async generateDomSeparationMigration(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const analysis = this._analyzeFileContent(content, filePath);
        
        // Check if component has DOM separation violations
        const domViolations = analysis.violations.filter(v => 
            v.type && (v.type.includes('dom') || v.type === 'missing-setup-dom' || v.type === 'needs-template-ref')
        );
        
        if (domViolations.length === 0) {
            return null; // No DOM separation needed
        }
        
        const migration = {
            file: filePath,
            componentName: analysis.componentName,
            violations: domViolations,
            changes: [],
            newMethods: [],
            domOperations: []
        };
        
        // Extract DOM operations from initialize() method
        const domOperations = this._extractDomOperations(content);
        migration.domOperations = domOperations;
        
        // Generate setupDom() method if needed
        if (domOperations.length > 0) {
            migration.newMethods.push({
                name: 'setupDom',
                code: this._generateSetupDomMethod(domOperations, analysis.componentName)
            });
            
            // Mark DOM operations for removal from initialize()
            migration.changes.push({
                type: 'remove-dom-from-init',
                operations: domOperations
            });
        }
        
        // Generate template ref methods for getElementById calls
        const elementIds = this._extractElementIds(content);
        elementIds.forEach(id => {
            migration.newMethods.push({
                name: `set${this._toPascalCase(id)}Element`,
                code: this._generateTemplateRefMethod(id, analysis.componentName)
            });
            
            migration.changes.push({
                type: 'replace-getelementbyid',
                elementId: id,
                newMethod: `set${this._toPascalCase(id)}Element`
            });
        });
        
        return migration;
    }

    /**
     * Extract DOM operations from initialize() method
     * @param {string} content - File content
     * @returns {Array} List of DOM operations with context
     */
    _extractDomOperations(content) {
        const operations = [];
        
        // Find the initialize method
        const initMatch = content.match(/initialize\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/m);
        if (!initMatch) return operations;
        
        const initContent = initMatch[1];
        
        // Define DOM operation patterns
        const domPatterns = [
            { pattern: /getElementById\(['"][\w-]+['"]\)[^;]*;?/g, type: 'getElementById' },
            { pattern: /querySelector\(['"][^'"]+['"]\)[^;]*;?/g, type: 'querySelector' },
            { pattern: /\.getBoundingClientRect\(\)[^;]*;?/g, type: 'getBoundingClientRect' },
            { pattern: /\.style\.[\w-]+\s*=[^;]*;?/g, type: 'styling' },
            { pattern: /\.addEventListener\([^)]+\)[^;]*;?/g, type: 'eventListener' },
            { pattern: /\.(offsetWidth|offsetHeight|clientWidth|clientHeight)[^;]*;?/g, type: 'dimensions' }
        ];
        
        // Extract each DOM operation with context
        domPatterns.forEach(({ pattern, type }) => {
            let match;
            while ((match = pattern.exec(initContent)) !== null) {
                const operation = match[0].trim();
                if (operation) {
                    operations.push({
                        operation,
                        type,
                        fullLine: this._getLineFromContent(initContent, match.index).trim(),
                        index: match.index
                    });
                }
            }
        });
        
        // Remove duplicates and sort by index
        const uniqueOperations = operations.filter((op, index, arr) => 
            arr.findIndex(o => o.operation === op.operation) === index
        ).sort((a, b) => a.index - b.index);
        
        return uniqueOperations;
    }

    /**
     * Extract element IDs from getElementById calls
     * @param {string} content - File content
     * @returns {Array} List of element IDs
     */
    _extractElementIds(content) {
        const ids = [];
        const idPattern = /getElementById\(['"]([^'"]+)['"]\)/g;
        let match;
        
        while ((match = idPattern.exec(content)) !== null) {
            const id = match[1];
            if (!ids.includes(id)) {
                ids.push(id);
            }
        }
        
        return ids;
    }

    /**
     * Generate setupDom() method code
     * @param {Array} domOperations - List of DOM operations
     * @param {string} componentName - Name of the component
     * @returns {string} Generated method code
     */
    _generateSetupDomMethod(domOperations, componentName) {
        const operationLines = domOperations.map(op => `    ${op.fullLine}`).join('\n');
        
        return `
    /**
     * DOM setup phase - called after Vue DOM is ready
     * Moved from initialize() for proper DOM separation
     */
    async setupDom() {
        // DOM operations moved from initialize()
${operationLines}
        
        console.log('[${componentName}] DOM setup complete');
    }`;
    }

    /**
     * Generate template ref injection method
     * @param {string} elementId - Element ID (e.g. 'scene-container')
     * @param {string} componentName - Name of the component
     * @returns {string} Generated method code
     */
    _generateTemplateRefMethod(elementId, componentName) {
        const methodName = `set${this._toPascalCase(elementId)}Element`;
        const propertyName = `${elementId.replace(/-/g, '')}Element`;
        
        return `
    /**
     * Template ref injection for ${elementId} element
     * Replaces getElementById('${elementId}') calls
     * @param {HTMLElement} element - The DOM element from template ref
     */
    ${methodName}(element) {
        this.${propertyName} = element;
        console.log('[${componentName}] ${elementId} element set via template ref');
        
        // Apply any setup that was waiting for this element
        if (this.${propertyName}) {
            this._setup${this._toPascalCase(elementId)}();
        }
    }

    /**
     * Setup logic for ${elementId} element
     * Called when element becomes available
     */
    _setup${this._toPascalCase(elementId)}() {
        // Add any element-specific setup logic here
        // This replaces the immediate DOM access from initialize()
    }`;
    }

    /**
     * Execute DOM separation migration on a component
     * @param {string} filePath - Path to the component file
     * @returns {boolean} True if migration was applied
     */
    async executeDomSeparationMigration(filePath) {
        const migration = await this.generateDomSeparationMigration(filePath);
        if (!migration) {
            console.log(`ℹ️  No DOM separation needed for ${filePath}`);
            return false;
        }
        
        console.log(`🔧 Applying DOM separation migration to ${migration.componentName}...`);
        
        let content = await fs.readFile(filePath, 'utf-8');
        
        // 1. Add new methods (setupDom, template ref methods)
        migration.newMethods.forEach(method => {
            const insertPoint = this._findMethodInsertPoint(content);
            content = this._insertMethod(content, insertPoint, method.code);
        });
        
        // 2. Remove DOM operations from initialize() method
        migration.changes.forEach(change => {
            if (change.type === 'remove-dom-from-init') {
                content = this._removeDomFromInitialize(content, change.operations);
            } else if (change.type === 'replace-getelementbyid') {
                content = this._replaceGetElementById(content, change.elementId, change.newMethod);
            }
        });
        
        // Write the modified file
        await fs.writeFile(filePath, content, 'utf-8');
        
        // 3. Add setupDom() call to AppContent.vue if this component needs it
        if (migration.newMethods.some(m => m.name === 'setupDom')) {
            await this._addSetupDomCallToAppContent(migration.componentName);
        }
        
        console.log(`✅ Applied DOM separation migration to ${migration.componentName}`);
        console.log(`   - Added ${migration.newMethods.length} new methods`);
        console.log(`   - Moved ${migration.domOperations.length} DOM operations to setupDom()`);
        
        return true;
    }

    /**
     * Helper method to convert kebab-case to PascalCase
     * @param {string} str - Input string (e.g. 'scene-container')
     * @returns {string} PascalCase string (e.g. 'SceneContainer')
     */
    _toPascalCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
                  .replace(/^([a-z])/, (g) => g.toUpperCase());
    }

    /**
     * Get line content from a specific index in content
     * @param {string} content - Content to search
     * @param {number} index - Character index
     * @returns {string} Line containing the index
     */
    _getLineFromContent(content, index) {
        const lines = content.substring(0, index).split('\n');
        const currentLineStart = content.lastIndexOf('\n', index) + 1;
        const currentLineEnd = content.indexOf('\n', index);
        const endIndex = currentLineEnd === -1 ? content.length : currentLineEnd;
        
        return content.substring(currentLineStart, endIndex);
    }

    /**
     * Find best insertion point for new methods in a class or Vue component
     * @param {string} content - File content
     * @returns {number} Character index for insertion
     */
    _findMethodInsertPoint(content) {
        // For Vue components, look for the methods section
        if (content.includes('methods: {')) {
            const methodsMatch = content.match(/methods:\s*\{([\s\S]*?)\n\s*\},?\s*\n/);
            if (methodsMatch) {
                // Find the last method in the methods section
                const methodsContent = methodsMatch[1];
                const lastMethodInSection = methodsContent.match(/.*\}[\s,]*$/m);
                if (lastMethodInSection) {
                    return methodsMatch.index + methodsMatch[0].indexOf(lastMethodInSection[0]) + lastMethodInSection[0].length;
                }
                // Fallback: just before the closing brace of methods section
                return methodsMatch.index + methodsMatch[1].length + methodsMatch[0].indexOf(methodsMatch[1]);
            }
        }
        
        // For class components, look for the last method in the class
        const lastMethodMatch = content.match(/(\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\})\s*\n*\s*\}/);
        if (lastMethodMatch) {
            return lastMethodMatch.index + lastMethodMatch[1].length;
        }
        
        // Fallback: look for constructor end
        const constructorMatch = content.match(/(constructor\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\})/);
        if (constructorMatch) {
            return constructorMatch.index + constructorMatch[1].length;
        }
        
        // Final fallback: before the last closing brace
        const lastBraceIndex = content.lastIndexOf('}');
        return lastBraceIndex - 1;
    }

    /**
     * Insert a new method into the class
     * @param {string} content - File content
     * @param {number} insertPoint - Where to insert
     * @param {string} methodCode - Method code to insert
     * @returns {string} Modified content
     */
    _insertMethod(content, insertPoint, methodCode) {
        return content.substring(0, insertPoint) + '\n' + methodCode + '\n' + content.substring(insertPoint);
    }

    /**
     * Remove DOM operations from initialize() method
     * @param {string} content - File content
     * @param {Array} operations - DOM operations to remove
     * @returns {string} Modified content
     */
    _removeDomFromInitialize(content, operations) {
        let modifiedContent = content;
        
        // Remove each DOM operation line
        operations.forEach(op => {
            // Create a more flexible pattern to match the line
            const escapedLine = op.fullLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const linePattern = new RegExp(`\\s*${escapedLine}\\s*`, 'g');
            modifiedContent = modifiedContent.replace(linePattern, '\n        // DOM operation moved to setupDom()');
        });
        
        return modifiedContent;
    }

    /**
     * Replace getElementById calls with template ref usage
     * @param {string} content - File content
     * @param {string} elementId - Element ID to replace
     * @param {string} newMethod - New method name
     * @returns {string} Modified content
     */
    _replaceGetElementById(content, elementId, newMethod) {
        const pattern = new RegExp(`getElementById\\(['"]${elementId}['"]\\)`, 'g');
        const replacement = `${elementId.replace(/-/g, '')}Element`;
        
        return content.replace(pattern, replacement);
    }

    /**
     * Add setupDom() call to AppContent.vue
     * @param {string} componentName - Name of component that needs setupDom() call
     */
    async _addSetupDomCallToAppContent(componentName) {
        const appContentPath = './modules/components/AppContent.vue';
        
        try {
            const content = await fs.readFile(appContentPath, 'utf-8');
            
            // Check if setupDom call already exists for this component
            if (content.includes(`${componentName}.setupDom()`)) {
                console.log(`   - setupDom() call already exists in AppContent.vue for ${componentName}`);
                return;
            }
            
            // Find the IM initialization section
            const imInitPattern = /\/\/ IM initialization[\s\S]*?window\.CONSOLE_LOG_IGNORE\('\[AppContent\][^']*complete'\);/;
            const imInitMatch = content.match(imInitPattern);
            
            if (imInitMatch) {
                const insertPoint = imInitMatch.index + imInitMatch[0].length;
                const setupDomCall = `
                
                // ${componentName} DOM setup after IM initialization
                const ${componentName.toLowerCase()} = initializationManager.getComponent('${componentName}');
                if (${componentName.toLowerCase()} && ${componentName.toLowerCase()}.setupDom) {
                    await ${componentName.toLowerCase()}.setupDom();
                    console.log('[AppContent] ${componentName} DOM setup complete');
                }`;
                
                const modifiedContent = content.substring(0, insertPoint) + setupDomCall + content.substring(insertPoint);
                await fs.writeFile(appContentPath, modifiedContent, 'utf-8');
                
                console.log(`   - Added setupDom() call to AppContent.vue for ${componentName}`);
            } else {
                console.warn(`   - Could not find IM initialization section in AppContent.vue for ${componentName}`);
            }
            
        } catch (error) {
            console.warn(`   - Could not update AppContent.vue for ${componentName}:`, error.message);
        }
    }

    /**
     * Batch execute DOM separation migration on multiple components
     * @param {Array} filePaths - Array of file paths to migrate
     * @returns {Object} Migration results summary
     */
    async batchExecuteDomSeparationMigration(filePaths = []) {
        const results = {
            total: filePaths.length,
            migrated: 0,
            skipped: 0,
            errors: 0,
            details: []
        };
        
        console.log(`🚀 Starting batch DOM separation migration for ${filePaths.length} components...`);
        
        for (const filePath of filePaths) {
            try {
                const migrated = await this.executeDomSeparationMigration(filePath);
                if (migrated) {
                    results.migrated++;
                    results.details.push({ file: filePath, status: 'migrated' });
                } else {
                    results.skipped++;
                    results.details.push({ file: filePath, status: 'skipped' });
                }
            } catch (error) {
                results.errors++;
                results.details.push({ file: filePath, status: 'error', error: error.message });
                console.error(`❌ Migration failed for ${filePath}:`, error.message);
            }
        }
        
        console.log(`📊 Batch migration complete:`);
        console.log(`   - Migrated: ${results.migrated}`);
        console.log(`   - Skipped: ${results.skipped}`);
        console.log(`   - Errors: ${results.errors}`);
        
        return results;
    }

    /**
     * Find all components that need DOM separation migration
     * @returns {Array} List of file paths that need migration
     */
    async findComponentsNeedingDomSeparation() {
        const results = await this.scanProject();
        
        const componentsNeedingMigration = results.violatingComponents
            .filter(component => 
                component.violations.some(v => 
                    (typeof v === 'object' && v.type && v.type.includes('dom')) ||
                    (typeof v === 'string' && (v.includes('DOM') || v.includes('setupDom')))
                )
            )
            .map(component => component.file);
        
        console.log(`🔍 Found ${componentsNeedingMigration.length} components needing DOM separation:`);
        componentsNeedingMigration.forEach(file => console.log(`   - ${file}`));
        
        return componentsNeedingMigration;
    }
}

export const componentScanner = new ComponentScanner();