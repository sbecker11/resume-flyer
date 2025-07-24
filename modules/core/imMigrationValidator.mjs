/**
 * IM Migration Validator - Detects components that haven't migrated to dependency injection
 * Extends the existing validation framework to specifically check for IM compliance
 */

import { ComponentScanner } from './componentScanner.mjs';
import { initializationManager } from './initializationManager.mjs';
import { promises as fs } from 'fs';
import path from 'path';

export class IMMigrationValidator extends ComponentScanner {
    constructor() {
        super();
        this.migrationResults = null;
    }

    /**
     * Comprehensive IM migration validation
     */
    async validateIMMigration(projectRoot = '.') {
        window.CONSOLE_LOG_IGNORE('🔄 Validating IM migration status...');
        
        const results = {
            scannedFiles: 0,
            components: [],
            migrationIssues: {
                notUsingDependencyInjection: [],
                usingServiceLocator: [],
                missingInitializeSignature: [],
                notExtendingBaseComponent: [],
                notRegisteredWithIM: [],
                missingDependencyDeclaration: [],
                usingDeprecatedInitializeWithDependencies: []
            },
            complianceStats: {
                fullyMigrated: 0,
                partiallyMigrated: 0,
                notMigrated: 0,
                total: 0
            },
            recommendations: []
        };

        try {
            await this._scanForIMCompliance(projectRoot, results);
            await this._analyzeIMResults(results);
            
            this.migrationResults = results;
            return results;
            
        } catch (error) {
            console.error('❌ IM migration validation failed:', error);
            throw error;
        }
    }

    /**
     * Scan directory for IM migration compliance
     */
    async _scanForIMCompliance(dirPath, results) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory() && !this._shouldSkipDirectory(entry.name)) {
                    await this._scanForIMCompliance(fullPath, results);
                } else if (entry.isFile() && this._isComponentFile(entry.name)) {
                    await this._analyzeComponentForIM(fullPath, results);
                }
            }
        } catch (error) {
            console.warn(`⚠️ Could not scan directory ${dirPath}:`, error.message);
        }
    }

    /**
     * Analyze individual component for IM migration compliance
     */
    async _analyzeComponentForIM(filePath, results) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            results.scannedFiles++;

            const componentAnalysis = await this._performIMAnalysis(content, filePath);
            
            if (componentAnalysis.isComponent) {
                results.components.push(componentAnalysis);
                
                // Categorize migration issues
                this._categorizeIMIssues(componentAnalysis, results.migrationIssues);
                
                // Update compliance stats
                this._updateComplianceStats(componentAnalysis, results.complianceStats);
            }

        } catch (error) {
            console.warn(`⚠️ Could not analyze file ${filePath}:`, error.message);
        }
    }

    /**
     * Perform detailed IM analysis on component
     */
    async _performIMAnalysis(content, filePath) {
        const analysis = {
            file: filePath,
            name: this._extractComponentName(content, filePath),
            type: this._determineComponentType(content, filePath),
            isComponent: false,
            imCompliance: {
                extendsBaseComponent: false,
                hasInitializeWithDependencies: false,
                registeredWithIM: false,
                declaresDependencies: false,
                usesServiceLocator: false,
                usesDependencyInjection: false,
                usesDeprecatedInitializeWithDependencies: false,
                migrationLevel: 'not-migrated' // 'fully-migrated', 'partially-migrated', 'not-migrated'
            },
            violations: [],
            recommendations: []
        };

        // Determine if this is a relevant component
        analysis.isComponent = this._isRelevantComponent(content, filePath);
        if (!analysis.isComponent) return analysis;

        // Check BaseComponent extension
        analysis.imCompliance.extendsBaseComponent = this._checkBaseComponentExtension(content);

        // Check initialize method signature
        analysis.imCompliance.hasInitializeWithDependencies = this._checkInitializeSignature(content);

        // Check IM registration
        analysis.imCompliance.registeredWithIM = this._checkIMRegistration(content);

        // Check dependency declaration
        analysis.imCompliance.declaresDependencies = this._checkDependencyDeclaration(content);

        // Check for service locator anti-pattern
        analysis.imCompliance.usesServiceLocator = this._checkServiceLocatorUsage(content);

        // Check for dependency injection usage
        analysis.imCompliance.usesDependencyInjection = this._checkDependencyInjectionUsage(content);

        // Check for deprecated initializeWithDependencies method
        analysis.imCompliance.usesDeprecatedInitializeWithDependencies = this._checkDeprecatedInitializeWithDependencies(content);

        // Determine migration level
        analysis.imCompliance.migrationLevel = this._determineMigrationLevel(analysis.imCompliance);

        // Generate violations and recommendations
        this._generateIMViolations(analysis, content);

        return analysis;
    }

    /**
     * Check if component extends BaseComponent
     */
    _checkBaseComponentExtension(content) {
        return /extends\s+BaseComponent/.test(content) || 
               /BaseVueComponentMixin/.test(content);
    }

    /**
     * Check if initialize method has dependency injection signature
     */
    _checkInitializeSignature(content) {
        // Look for initialize(dependencies) or async initialize(dependencies)
        const patterns = [
            /async\s+initialize\s*\(\s*dependencies/,
            /initialize\s*\(\s*dependencies/,
            /async\s+initialize\s*\(\s*\{[^}]*\}/,  // destructured dependencies
            /initialize\s*\(\s*\{[^}]*\}/
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }

    /**
     * Check if component is registered with InitializationManager
     */
    _checkIMRegistration(content) {
        const patterns = [
            /initializationManager\.register/,
            /super\s*\(\s*['"`][^'"`]+['"`]\s*\)/, // BaseComponent constructor call
            /registerForInitialization/
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }

    /**
     * Check if component declares dependencies properly (via signature or other methods)
     */
    _checkDependencyDeclaration(content) {
        const patterns = [
            /getComponentDependencies\s*\(\s*\)\s*\{/, // Vue components still use this
            /dependencies\s*:\s*\[/,
            /initialize\s*\(\s*\{[^}]+\}/, // Destructured parameters in initialize
            /async\s+initialize\s*\(\s*\{[^}]+\}/ // Async version
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }

    /**
     * Check for service locator anti-pattern usage
     */
    _checkServiceLocatorUsage(content) {
        const serviceLocatorPatterns = [
            /initializationManager\.getComponent/,
            /getComponent\s*\(\s*['"`]/,
            // Look for direct manager imports being used in initialize
            /initialize[^{]*\{[^}]*(?:selectionManager|badgeManager|stateManager)\s*=/,
            // Check for imported singletons being assigned in initialize
            /this\.\w+\s*=\s*\w+Manager(?!\.)/
        ];
        
        return serviceLocatorPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Check for proper dependency injection usage
     */
    _checkDependencyInjectionUsage(content) {
        const dependencyInjectionPatterns = [
            /dependencies\.\w+/,  // accessing dependencies.SomeManager
            /this\.\w+\s*=\s*dependencies\.\w+/, // assigning from dependencies parameter
            /const\s*\{\s*\w+\s*\}\s*=\s*dependencies/, // destructuring dependencies
            /initialize\s*\([^)]*dependencies[^)]*\)[^{]*\{[^}]*dependencies\./
        ];
        
        return dependencyInjectionPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Check for deprecated initializeWithDependencies method
     */
    _checkDeprecatedInitializeWithDependencies(content) {
        const deprecatedPatterns = [
            /async\s+initializeWithDependencies\s*\(/,  // async initializeWithDependencies()
            /initializeWithDependencies\s*\(/,          // initializeWithDependencies()
            /initializeWithDependencies\s*:\s*async/,   // Vue component methods: { initializeWithDependencies: async
            /initializeWithDependencies\s*\(\s*\)\s*\{/ // initializeWithDependencies() { ... }
        ];
        
        return deprecatedPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Determine migration level based on compliance checks
     */
    _determineMigrationLevel(compliance) {
        const {
            extendsBaseComponent,
            hasInitializeWithDependencies,
            registeredWithIM,
            usesDependencyInjection,
            usesServiceLocator
        } = compliance;

        // Fully migrated: Uses new pattern completely
        if (extendsBaseComponent && hasInitializeWithDependencies && 
            registeredWithIM && usesDependencyInjection && !usesServiceLocator) {
            return 'fully-migrated';
        }

        // Partially migrated: Some new patterns but still has issues
        if ((extendsBaseComponent || registeredWithIM) && 
            (hasInitializeWithDependencies || usesDependencyInjection)) {
            return 'partially-migrated';
        }

        // Not migrated: Still using old patterns
        return 'not-migrated';
    }

    /**
     * Generate violations and recommendations for component
     */
    _generateIMViolations(analysis, content) {
        const { imCompliance } = analysis;
        
        if (!imCompliance.extendsBaseComponent) {
            analysis.violations.push('Component does not extend BaseComponent or use BaseVueComponentMixin');
            analysis.recommendations.push('Change class to extend BaseComponent: class MyComponent extends BaseComponent');
        }

        if (!imCompliance.hasInitializeWithDependencies) {
            analysis.violations.push('initialize() method does not use dependency injection signature');
            analysis.recommendations.push('Update initialize method: async initialize(dependencies) { ... }');
        }

        if (!imCompliance.registeredWithIM) {
            analysis.violations.push('Component is not registered with InitializationManager');
            analysis.recommendations.push('Extend BaseComponent or manually register with initializationManager.register()');
        }

        if (!imCompliance.declaresDependencies) {
            analysis.violations.push('Component does not declare dependencies via initialize signature or other methods');
            analysis.recommendations.push('Add dependencies via initialize({ dependency1, dependency2 }) signature or Vue getComponentDependencies()');
        }

        if (imCompliance.usesServiceLocator) {
            analysis.violations.push('Component uses deprecated service locator pattern');
            analysis.recommendations.push('Replace initializationManager.getComponent() calls with dependency injection');
        }

        if (!imCompliance.usesDependencyInjection && imCompliance.declaresDependencies) {
            analysis.violations.push('Component declares dependencies but does not use dependency injection');
            analysis.recommendations.push('Access dependencies via parameter: this.manager = dependencies.ManagerName');
        }

        if (imCompliance.usesDeprecatedInitializeWithDependencies) {
            analysis.violations.push('Component uses deprecated initializeWithDependencies() method');
            analysis.recommendations.push('Replace initializeWithDependencies() with initialize(dependencies) method for reactive dependency injection');
        }

        // Check for manual dependency.isInitialized checks (anti-pattern)
        if (/\w+\.isInitialized\(\)|\.isInitialized\s*&&|\.isInitialized\s*\?/.test(content)) {
            analysis.violations.push('Component manually checks dependency.isInitialized - IM framework guarantees dependencies are ready');
            analysis.recommendations.push('Remove dependency.isInitialized checks - IM ensures dependencies are initialized before calling initialize(dependencies)');
        }
    }

    /**
     * Categorize issues for reporting
     */
    _categorizeIMIssues(analysis, issues) {
        const { imCompliance } = analysis;

        if (!imCompliance.usesDependencyInjection) {
            issues.notUsingDependencyInjection.push(analysis);
        }

        if (imCompliance.usesServiceLocator) {
            issues.usingServiceLocator.push(analysis);
        }

        if (!imCompliance.hasInitializeWithDependencies) {
            issues.missingInitializeSignature.push(analysis);
        }

        if (!imCompliance.extendsBaseComponent) {
            issues.notExtendingBaseComponent.push(analysis);
        }

        if (!imCompliance.registeredWithIM) {
            issues.notRegisteredWithIM.push(analysis);
        }

        if (!imCompliance.declaresDependencies) {
            issues.missingDependencyDeclaration.push(analysis);
        }

        if (imCompliance.usesDeprecatedInitializeWithDependencies) {
            issues.usingDeprecatedInitializeWithDependencies.push(analysis);
        }
    }

    /**
     * Update compliance statistics
     */
    _updateComplianceStats(analysis, stats) {
        stats.total++;
        
        switch (analysis.imCompliance.migrationLevel) {
            case 'fully-migrated':
                stats.fullyMigrated++;
                break;
            case 'partially-migrated':
                stats.partiallyMigrated++;
                break;
            case 'not-migrated':
                stats.notMigrated++;
                break;
        }
    }

    /**
     * Extract component name from content or file path
     */
    _extractComponentName(content, filePath) {
        // Try to extract class name
        const classMatch = content.match(/class\s+(\w+)/);
        if (classMatch) return classMatch[1];

        // Try to extract Vue component name
        const vueNameMatch = content.match(/name:\s*['"`]([^'"`]+)['"`]/);
        if (vueNameMatch) return vueNameMatch[1];

        // Fallback to filename
        return path.basename(filePath, path.extname(filePath));
    }

    /**
     * Determine component type
     */
    _determineComponentType(content, filePath) {
        if (filePath.endsWith('.vue')) return 'vue';
        if (content.includes('class ') && content.includes('Controller')) return 'controller';
        if (content.includes('class ') && content.includes('Manager')) return 'manager';
        if (content.includes('class ') && content.includes('Component')) return 'component';
        return 'unknown';
    }

    /**
     * Check if this is a relevant component for IM migration
     */
    _isRelevantComponent(content, filePath) {
        // Skip abstract base classes
        if (filePath.includes('BaseComponent') || filePath.includes('Abstract')) {
            return false;
        }

        // Include if it's a Vue component
        if (filePath.endsWith('.vue')) return true;

        // Include if it's a class component that might need IM
        const componentIndicators = [
            /class\s+\w+.*Component/,
            /class\s+\w+.*Controller/,
            /class\s+\w+.*Manager/,
            /extends\s+BaseComponent/,
            /initializationManager/,
            /selectionManager/,
            /badgeManager/
        ];

        return componentIndicators.some(pattern => pattern.test(content));
    }

    /**
     * Analyze results and generate overall recommendations
     */
    async _analyzeIMResults(results) {
        const { complianceStats, migrationIssues } = results;
        
        window.CONSOLE_LOG_IGNORE(`📊 IM Migration Analysis Complete:`);
        window.CONSOLE_LOG_IGNORE(`  - Total Components: ${complianceStats.total}`);
        window.CONSOLE_LOG_IGNORE(`  - Fully Migrated: ${complianceStats.fullyMigrated}`);
        window.CONSOLE_LOG_IGNORE(`  - Partially Migrated: ${complianceStats.partiallyMigrated}`);
        window.CONSOLE_LOG_IGNORE(`  - Not Migrated: ${complianceStats.notMigrated}`);

        const migrationRate = complianceStats.total > 0 ? 
            (complianceStats.fullyMigrated / complianceStats.total * 100).toFixed(1) : 100;
        
        window.CONSOLE_LOG_IGNORE(`📈 Migration Rate: ${migrationRate}%`);

        // Generate priority recommendations
        results.recommendations = this._generatePriorityRecommendations(migrationIssues);

        if (complianceStats.notMigrated > 0 || complianceStats.partiallyMigrated > 0) {
            console.warn(`⚠️ Found ${complianceStats.notMigrated + complianceStats.partiallyMigrated} components needing migration`);
        }
    }

    /**
     * Generate priority recommendations for migration
     */
    _generatePriorityRecommendations(issues) {
        const recommendations = [];

        // High priority: Components using service locator
        if (issues.usingServiceLocator.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'Components using deprecated service locator pattern',
                count: issues.usingServiceLocator.length,
                components: issues.usingServiceLocator.map(c => c.name),
                action: 'Replace initializationManager.getComponent() with dependency injection'
            });
        }

        // High priority: Components not extending BaseComponent
        if (issues.notExtendingBaseComponent.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'Components not extending BaseComponent',
                count: issues.notExtendingBaseComponent.length,
                components: issues.notExtendingBaseComponent.map(c => c.name),
                action: 'Change class to extend BaseComponent or use BaseVueComponentMixin'
            });
        }

        // Medium priority: Missing dependency injection
        if (issues.notUsingDependencyInjection.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                issue: 'Components not using dependency injection',
                count: issues.notUsingDependencyInjection.length,
                components: issues.notUsingDependencyInjection.map(c => c.name),
                action: 'Update initialize method to use dependencies parameter'
            });
        }

        // Medium priority: Missing initialize signature
        if (issues.missingInitializeSignature.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                issue: 'Components with incorrect initialize signature',
                count: issues.missingInitializeSignature.length,
                components: issues.missingInitializeSignature.map(c => c.name),
                action: 'Change initialize() to initialize(dependencies = {})'
            });
        }

        // Medium priority: Using deprecated initializeWithDependencies method
        if (issues.usingDeprecatedInitializeWithDependencies.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                issue: 'Components using deprecated initializeWithDependencies method',
                count: issues.usingDeprecatedInitializeWithDependencies.length,
                components: issues.usingDeprecatedInitializeWithDependencies.map(c => c.name),
                action: 'Replace initializeWithDependencies() with initialize(dependencies) for reactive dependency injection'
            });
        }

        return recommendations;
    }

    /**
     * Generate detailed migration report
     */
    generateMigrationReport() {
        if (!this.migrationResults) {
            throw new Error('Must run validateIMMigration() first');
        }

        const { complianceStats, migrationIssues, recommendations, components } = this.migrationResults;

        const migrationRate = complianceStats.total > 0 ? 
            (complianceStats.fullyMigrated / complianceStats.total * 100).toFixed(1) : 100;

        let report = `
# IM Migration Compliance Report

## Executive Summary
- **Total Components Analyzed**: ${complianceStats.total}
- **Migration Rate**: ${migrationRate}%
- **Fully Migrated**: ${complianceStats.fullyMigrated} components
- **Partially Migrated**: ${complianceStats.partiallyMigrated} components  
- **Not Migrated**: ${complianceStats.notMigrated} components

## Priority Action Items
`;

        recommendations.forEach((rec, index) => {
            report += `
### ${index + 1}. ${rec.issue} (${rec.priority} Priority)
- **Count**: ${rec.count} components
- **Components**: ${rec.components.join(', ')}
- **Action**: ${rec.action}
`;
        });

        report += `
## Detailed Analysis

### Components Using Service Locator Pattern (❌ High Priority)
${this._formatComponentList(migrationIssues.usingServiceLocator)}

### Components Not Extending BaseComponent (❌ High Priority)  
${this._formatComponentList(migrationIssues.notExtendingBaseComponent)}

### Components Missing Dependency Injection (⚠️ Medium Priority)
${this._formatComponentList(migrationIssues.notUsingDependencyInjection)}

### Components With Incorrect Initialize Signature (⚠️ Medium Priority)
${this._formatComponentList(migrationIssues.missingInitializeSignature)}

### Components Using Deprecated initializeWithDependencies() Method (⚠️ Medium Priority)
${this._formatComponentList(migrationIssues.usingDeprecatedInitializeWithDependencies)}

## Migration Examples

### Before (Service Locator Pattern):
\`\`\`javascript
async initialize() {
    // OLD PATTERN - Manual lookup
    this.selectionManager = initializationManager.getComponent('SelectionManager');
    this.stateManager = initializationManager.getComponent('StateManager');
}
\`\`\`

### After (Dependency Injection Pattern):
\`\`\`javascript  
async initialize(dependencies) {
    // NEW PATTERN - Direct injection
    this.selectionManager = dependencies.SelectionManager;
    this.stateManager = dependencies.StateManager;
}
\`\`\`

## Next Steps
1. **Immediate**: Fix HIGH priority issues (service locator usage, BaseComponent extension)
2. **Short-term**: Update initialize signatures and add dependency injection
3. **Long-term**: Ensure all new components follow the dependency injection pattern

Run \`enforceIMCompliance()\` to fail the application until all components are migrated.
`;

        return report;
    }

    /**
     * Format component list for report
     */
    _formatComponentList(components) {
        if (components.length === 0) {
            return '✅ None found\n';
        }

        return components.map(comp => 
            `- **${comp.name}** (${comp.file})\n  - Migration Level: ${comp.imCompliance.migrationLevel}\n  - Issues: ${comp.violations.join(', ')}`
        ).join('\n') + '\n';
    }

    /**
     * Enforce IM compliance - fail if components haven't migrated
     */
    enforceIMCompliance() {
        if (!this.migrationResults) {
            throw new Error('Must run validateIMMigration() first');
        }

        const { complianceStats, migrationIssues } = this.migrationResults;
        const nonCompliantCount = complianceStats.notMigrated + complianceStats.partiallyMigrated;

        if (nonCompliantCount > 0) {
            const violations = [];
            
            migrationIssues.usingServiceLocator.forEach(comp => {
                violations.push(`  - ${comp.name} (${comp.file}): Using service locator pattern`);
            });
            
            migrationIssues.notExtendingBaseComponent.forEach(comp => {
                violations.push(`  - ${comp.name} (${comp.file}): Not extending BaseComponent`);
            });
            
            migrationIssues.notUsingDependencyInjection.forEach(comp => {
                violations.push(`  - ${comp.name} (${comp.file}): Not using dependency injection`);
            });

            migrationIssues.usingDeprecatedInitializeWithDependencies.forEach(comp => {
                violations.push(`  - ${comp.name} (${comp.file}): Using deprecated initializeWithDependencies() method`);
            });

            throw new Error(`❌ FATAL: Found ${nonCompliantCount} components not migrated to IM dependency injection:

${violations.join('\n')}

ALL components MUST:
1. Extend BaseComponent or use BaseVueComponentMixin
2. Use initialize(dependencies) signature  
3. Access dependencies via injection, not service locator
4. Register with InitializationManager

Migration rate: ${(complianceStats.fullyMigrated / complianceStats.total * 100).toFixed(1)}%
Target: 100% migration required

Run generateMigrationReport() for detailed fix instructions.`);
        }

        window.CONSOLE_LOG_IGNORE('✅ All components have migrated to IM dependency injection pattern');
        return true;
    }
}

export const imMigrationValidator = new IMMigrationValidator();