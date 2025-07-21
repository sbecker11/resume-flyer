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
            { name: 'selectionManager', pattern: /(?:import.*selectionManager|selectionManager\\.)/g },
            { name: 'badgeManager', pattern: /(?:import.*badgeManager|badgeManager\\.)/g },
            { name: 'initializationManager', pattern: /(?:import.*initializationManager|initializationManager\\.)/g },
            { name: 'eventBus', pattern: /(?:import.*eventBus|eventBus\\.)/g }
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
            if (!content.includes('getComponentDependencies')) {
                analysis.violations.push('Vue component missing getComponentDependencies() method');
            }
            if (!content.includes('initializeWithDependencies')) {
                analysis.violations.push('Vue component missing initializeWithDependencies() method');
            }
        }

        if (analysis.componentType === 'class' && analysis.usesManagers.length > 0) {
            if (!content.includes('extends BaseComponent')) {
                analysis.violations.push('Class component should extend BaseComponent');
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
     * Get fix recommendation for violation
     */
    _getFixRecommendation(violation) {
        if (violation.includes('not registered')) {
            return 'Add component registration with InitializationManager or extend BaseComponent';
        }
        if (violation.includes('getComponentDependencies')) {
            return 'Add getComponentDependencies() method returning array of required dependencies';
        }
        if (violation.includes('initializeWithDependencies')) {
            return 'Add initializeWithDependencies() method for component setup';
        }
        if (violation.includes('extends BaseComponent')) {
            return 'Change class to extend BaseComponent instead of base class';
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
}

export const componentScanner = new ComponentScanner();