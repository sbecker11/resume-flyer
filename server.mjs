import express from 'express';
import fs from 'fs/promises'; // Use promises for async/await
import path from 'path';
import cors from 'cors';

// Import our dependency enforcement system (server-side only)

// Assume server is run from the project root directory
const PROJECT_ROOT = process.cwd();
const PALETTE_DIR_PATH = path.resolve(PROJECT_ROOT, 'static_content', 'colorPalettes');
const CSS_FILE_PATH = path.resolve(PROJECT_ROOT, 'static_content', 'css', 'palette-styles.css');
const STATE_FILE_PATH = path.resolve(PROJECT_ROOT, 'app_state.json');

const app = express();

// --- Middleware ---
// Enable CORS for all origins (adjust for production if needed)
app.use(cors());

// Parse JSON bodies for the state endpoint
app.use(express.json());
// Parse text bodies for the CSS endpoint
app.use(express.text());

// --- API Endpoints ---
// These must be defined *before* the static file server.

// GET /api/state: Fetches the saved application state
app.get('/api/state', async (req, res) => {
    try {
        await fs.access(STATE_FILE_PATH);
        const stateData = await fs.readFile(STATE_FILE_PATH, 'utf-8');
        const parsedState = JSON.parse(stateData);
        console.log('📖 Loading app state from disk - colorPalette:', parsedState.theme?.colorPalette);
        res.json(parsedState);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📖 State file not found, client will use defaults');
            res.status(404).json({ error: 'State file not found.' });
        } else {
            console.error('Error reading state file:', error);
            res.status(500).json({ error: 'Failed to read state file.' });
        }
    }
});

// POST /api/state: Saves the application state
app.post('/api/state', async (req, res) => {
    try {
        const stateData = JSON.stringify(req.body, null, 2);
        await fs.writeFile(STATE_FILE_PATH, stateData, 'utf-8');
        console.log('💾 Saving app state to disk - colorPalette:', req.body.theme?.colorPalette);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing state file:', error);
        res.status(500).json({ error: 'Failed to write state file.' });
    }
});

// GET /api/palette-manifest: Provides a sorted list of color palettes
app.get('/api/palette-manifest', async (req, res) => {
    try {
        const allEntries = await fs.readdir(PALETTE_DIR_PATH);
        const jsonFiles = allEntries.filter(entry => entry.endsWith('.json'));
        jsonFiles.sort((a, b) => {
            const regex = /^(\d+)-/;
            const matchA = a.match(regex);
            const matchB = b.match(regex);
            const numA = matchA ? parseInt(matchA[1], 10) : -1;
            const numB = matchB ? parseInt(matchB[1], 10) : -1;
            if (numA !== -1 && numB !== -1) return numA - numB;
            if (numA !== -1) return -1;
            if (numB !== -1) return 1;
            return a.localeCompare(b);
        });
        res.json(jsonFiles);
    } catch (error) {
        res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: 'Failed to read palette directory.' });
    }
});

// POST /api/write-css: Writes dynamic CSS content to a file
app.post('/api/write-css', async (req, res) => {
    try {
        await fs.mkdir(path.dirname(CSS_FILE_PATH), { recursive: true });
        await fs.writeFile(CSS_FILE_PATH, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to write CSS file.' });
    }
});

// GET /api/check-dependencies: Server-side dependency compliance check
app.get('/api/check-dependencies', async (req, res) => {
    try {
        console.log('🔍 Server: Running dependency compliance check...');
        
        // Scan project for dependency violations
        
        // Generate detailed report
        
        // Check for violations
        const hasViolations = scanResults.violatingComponents.length > 0;
        
        if (hasViolations) {
            console.error(`❌ Server: Found ${scanResults.violatingComponents.length} dependency violations`);
            
            // Return violation details
            res.status(400).json({
                success: false,
                hasViolations: true,
                violationCount: scanResults.violatingComponents.length,
                violations: scanResults.violatingComponents,
                summary: {
                    scannedFiles: scanResults.scannedFiles,
                    foundComponents: scanResults.foundComponents.length,
                    violatingComponents: scanResults.violatingComponents.length
                },
                report: report,
                message: `Found ${scanResults.violatingComponents.length} components with dependency management violations`
            });
        } else {
            console.log('✅ Server: All components comply with dependency management');
            
            res.json({
                success: true,
                hasViolations: false,
                violationCount: 0,
                summary: {
                    scannedFiles: scanResults.scannedFiles,
                    foundComponents: scanResults.foundComponents.length,
                    violatingComponents: 0
                },
                message: 'All components comply with dependency management requirements'
            });
        }
        
    } catch (error) {
        console.error('❌ Server: Dependency check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Dependency check failed',
            message: error.message
        });
    }
});

// GET /violations: Dynamic HTML page showing all dependency violations
app.get('/violations', async (req, res) => {
    try {
        console.log('🌐 Server: Generating violations page...');
        
        // Run dependency scan
        
        // Generate HTML page
        const html = generateViolationsHTML(scanResults, report);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (error) {
        console.error('❌ Server: Failed to generate violations page:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error Generating Violations Page</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
    }
});

// Function to generate violations HTML page
function generateViolationsHTML(scanResults, report) {
    const hasViolations = scanResults.violatingComponents.length > 0;
    const violationCount = scanResults.violatingComponents.length;
    
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Violations Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            background: ${hasViolations ? '#dc3545' : '#28a745'};
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .violation-card {
            background: white;
            border-left: 4px solid #dc3545;
            margin-bottom: 20px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .violation-header {
            padding: 15px 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
        }
        .violation-body {
            padding: 20px;
        }
        .component-name {
            font-size: 1.3em;
            font-weight: bold;
            color: #dc3545;
        }
        .file-path {
            color: #6c757d;
            font-family: monospace;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .issues-list {
            margin: 15px 0;
        }
        .issue-item {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            color: #742a2a;
        }
        .fix-section {
            background: #f0f8ff;
            border: 1px solid #b8daff;
            padding: 15px;
            border-radius: 4px;
            margin-top: 15px;
        }
        .fix-title {
            font-weight: bold;
            color: #0056b3;
            margin-bottom: 10px;
        }
        .fix-steps {
            list-style: none;
            padding: 0;
        }
        .fix-steps li {
            padding: 5px 0;
            border-bottom: 1px solid #e3f2fd;
        }
        .fix-steps li:last-child {
            border-bottom: none;
        }
        .code {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 2px 6px;
            font-family: monospace;
            font-size: 0.9em;
        }
        .stats {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: ${hasViolations ? '#dc3545' : '#28a745'};
        }
        .stat-label {
            color: #6c757d;
            font-size: 0.9em;
        }
        .no-violations {
            background: white;
            padding: 40px;
            text-align: center;
            border-radius: 8px;
            border: 2px solid #28a745;
        }
        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
        }
        .refresh-btn:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔒 Dependency Violations Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        ${hasViolations 
            ? `<p>⚠️ Found ${violationCount} component${violationCount !== 1 ? 's' : ''} with dependency management violations</p>`
            : `<p>✅ All components comply with dependency management requirements</p>`
        }
    </div>

    <div class="stats">
        <div class="stat-item">
            <div class="stat-number">${scanResults.scannedFiles}</div>
            <div class="stat-label">Files Scanned</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${scanResults.foundComponents.length}</div>
            <div class="stat-label">Components Found</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${violationCount}</div>
            <div class="stat-label">Violations</div>
        </div>
        <div class="stat-item">
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
        </div>
    </div>
`;

    if (hasViolations) {
        html += `<h2>📋 Violations Details</h2>`;
        
        scanResults.violatingComponents.forEach((violation, index) => {
            html += `
            <div class="violation-card">
                <div class="violation-header">
                    <div class="component-name">${index + 1}. ${violation.name}</div>
                    <div class="file-path">${violation.file}</div>
                </div>
                <div class="violation-body">
                    <div class="issues-list">
                        <h4>🚨 Issues Found:</h4>
                        ${violation.violations.map(issue => {
                            const issueText = typeof issue === 'string' ? issue : (issue.message || issue.toString());
                            return `<div class="issue-item">• ${issueText}</div>`;
                        }).join('')}
                    </div>
                    
                    <div class="fix-section">
                        <div class="fix-title">🔧 How to Fix:</div>
                        ${generateFixInstructions(violation)}
                    </div>
                </div>
            </div>
            `;
        });
    } else {
        html += `
        <div class="no-violations">
            <h2>🎉 No Violations Found!</h2>
            <p>All components are properly following dependency management patterns.</p>
            <p>Your application is compliant and ready to run.</p>
        </div>
        `;
    }

    html += `
    <footer style="text-align: center; margin-top: 40px; color: #6c757d;">
        <p>Generated by Dependency Enforcement System</p>
        <p><a href="http://localhost:5173/">← Back to Application</a></p>
    </footer>
</body>
</html>
    `;

    return html;
}

// Generate specific fix instructions for each violation type
function generateFixInstructions(violation) {
    const isVueComponent = violation.file && violation.file.endsWith('.vue');
    const componentName = violation.name;
    
    if (componentName === 'BadgePositioner') {
        return `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
                <li><strong>Add import:</strong> <code class="code">import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Change class declaration:</strong><br>
                    From: <code class="code">export class BadgePositioner {</code><br>
                    To: <code class="code">export class BadgePositioner extends BaseComponent {</code>
                </li>
                <li><strong>Update constructor:</strong> Add <code class="code">super('BadgePositioner')</code> as first line</li>
                <li><strong>Add initialize method:</strong> <code class="code">async initialize({ selectionManager }) { /* setup code */ }</code></li>
                <li><strong>Add destroy method:</strong> <code class="code">destroy() { /* cleanup code */ }</code></li>
            </ol>
        `;
    } else if (isVueComponent) {
        return `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
                <li><strong>Add import:</strong> <code class="code">import { BaseVueComponentMixin } from '@/modules/core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Add mixin:</strong> <code class="code">mixins: [BaseVueComponentMixin]</code></li>
                <li><strong>Add initialize method:</strong> <code class="code">initialize(dependencies) { /* and save references */ this.component1 = dependencies.component1; }</code></li>
                <li><strong>Add cleanup method:</strong> <code class="code">cleanupDependencies() { /* cleanup */ }</code></li>
            </ol>
        `;
    } else {
        // Handle different violation types with specific instructions
        let instructions = `
            <ol class="fix-steps">
                <li><strong>Open file:</strong> <code class="code">${violation.file}</code></li>
        `;

        // Helper function to get violation text (handles both string and object violations)
        const getViolationText = (v) => typeof v === 'string' ? v : (v.message || v.toString());
        
        // Check for specific violation types and add targeted instructions
        if (violation.violations && violation.violations.some(v => getViolationText(v).includes('manually set this.isInitialized'))) {
            instructions += `
                <li><strong>Remove manual isInitialized assignments:</strong> Delete lines with <code class="code">this.isInitialized = true</code> or <code class="code">this.isInitialized = false</code></li>
                <li><strong>BaseComponent handles this automatically:</strong> After your <code class="code">initialize()</code> method completes, BaseComponent sets <code class="code">this.isInitialized = true</code></li>
                <li><strong>Only read, don't write:</strong> Use <code class="code">if (this.isInitialized)</code> to check status, but never assign values</li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('custom isInitialized getter'))) {
            instructions += `
                <li><strong>Remove custom getter:</strong> Delete <code class="code">get isInitialized() { ... }</code> method</li>
                <li><strong>BaseComponent provides this:</strong> Use <code class="code">this.isInitialized</code> directly as a property</li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('private _isInitialized'))) {
            instructions += `
                <li><strong>Remove private property:</strong> Delete <code class="code">this._isInitialized</code> assignments and references</li>
                <li><strong>Use BaseComponent's property:</strong> Replace with <code class="code">this.isInitialized</code></li>
            `;
        } else if (violation.violations && violation.violations.some(v => getViolationText(v).includes('getIsInitialized'))) {
            instructions += `
                <li><strong>Remove deprecated method:</strong> Delete <code class="code">getIsInitialized()</code> method</li>
                <li><strong>Use property access:</strong> Replace <code class="code">component.getIsInitialized()</code> with <code class="code">component.isInitialized</code></li>
            `;
        } else {
            // General IM component setup
            instructions += `
                <li><strong>Add import:</strong> <code class="code">import { BaseComponent } from '../core/abstracts/BaseComponent.mjs';</code></li>
                <li><strong>Extend BaseComponent:</strong> <code class="code">class ${componentName} extends BaseComponent</code></li>
                <li><strong>Add constructor:</strong> <code class="code">super('${componentName}')</code></li>
                <li><strong>Override initialize():</strong> <code class="code">async initialize({ manager1, manager2 }) { /* setup logic */ }</code></li>
                <li><strong>Override destroy():</strong> Cleanup logic</li>
            `;
        }

        instructions += `
            </ol>
        `;
        return instructions;
    }
}

// --- Start the server with port finding ---
// --- Static File Serving ---
// Serve static content (including color palettes)
app.use('/static_content', express.static(path.resolve(PROJECT_ROOT, 'static_content')));

const MAX_PORT_RETRIES = 10; // Limit how many ports to try
const START_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3009;

function startServer(port) {
    if (port >= START_PORT + MAX_PORT_RETRIES) {
        console.error(`Failed to bind server after trying ports ${START_PORT} to ${port - 1}. Exiting.`);
        process.exit(1); // Exit if no port found
    }

    const server = app.listen(port, () => {
        // Success!
        console.log(`Server listening on http://localhost:${port}`);
        console.log(`Serving dynamic palette manifest at /api/palette-manifest`);
        console.log(`Palette directory path: ${PALETTE_DIR_PATH}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
            // Close the server instance that failed before retrying
            server.close(() => {
                 startServer(port + 1); // Recursively try the next port
            });
        } else {
            // Handle other server errors
            console.error("Server failed to start:", err);
            process.exit(1);
        }
    });
}

// Initial call to start the server process
startServer(START_PORT);