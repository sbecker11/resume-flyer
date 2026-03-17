#!/usr/bin/env node
/**
 * Self-contained IM compliance scan. Discovers component files and runs a
 * minimal set of violation checks; prints compliance rate and lists.
 * Run from project root: node scripts/run-compliance-scan.mjs
 *
 * Option: --write-fragment  writes docs/im/compliance-summary-fragment.md
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.output', 'archived_components', 'tmp', 'archive']);
const COMPONENT_EXTS = ['.vue', '.mjs', '.js', '.ts'];
const COMPONENT_PATTERNS = ['Component', 'Controller', 'Manager', 'Service'];
const EXCLUDE_PATTERNS = ['BaseComponent', 'Abstract'];

function isComponentFile(filename) {
  if (/\.test\.(mjs|js|ts)$/.test(filename)) return false;
  const hasExt = COMPONENT_EXTS.some(ext => filename.endsWith(ext));
  const hasPattern = COMPONENT_PATTERNS.some(p => filename.includes(p));
  const excluded = EXCLUDE_PATTERNS.some(p => filename.includes(p));
  return hasExt && (hasPattern || filename.endsWith('.vue')) && !excluded;
}

async function discoverFiles(dir, base = '') {
  const entries = await readdir(path.join(dir, base), { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      files.push(...(await discoverFiles(dir, rel)));
    } else if (e.isFile() && isComponentFile(e.name)) {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Minimal violation checks (no method-boundary parsing). Returns array of violation messages.
 */
function analyzeFile(content, filePath) {
  const violations = [];
  const name = filePath.endsWith('.vue') ? path.basename(filePath) : path.basename(filePath, path.extname(filePath));

  // Manager usage without registration
  const usesManagers = [
    /selectionManager\./.test(content),
    /initializationManager\./.test(content),
    /eventBus\./.test(content)
  ].filter(Boolean).length;
  const isRegistered = /initializationManager\.register|registerForInitialization|extends BaseComponent|BaseVueComponentMixin/.test(content);
  if (usesManagers > 0 && !isRegistered) {
    violations.push('Uses managers but not registered with IM');
  }

  // Vue + managers but no initialize(dependencies)
  if (filePath.endsWith('.vue') && usesManagers > 0) {
    if (!/(?<!async\s+)initialize\s*\(\s*dependencies\s*\)/.test(content)) {
      violations.push('Vue component missing initialize(dependencies)');
    }
  }

  // getElementById on key IM elements
  const keyIds = ['scene-container', 'aim-point', 'focal-point', 'bulls-eye'];
  for (const id of keyIds) {
    if (new RegExp(`getElementById\\(['"]${id}['"]\\)`).test(content)) {
      violations.push(`getElementById('${id}') - use dependency injection`);
      break;
    }
  }

  // Async initialize (IM handles async)
  if (/async\s+initialize\s*\(/.test(content)) {
    violations.push('initialize() should not be async');
  }

  // DOM separation: file uses getElementById and has initialize but no setupDom
  if (/getElementById\s*\(/.test(content) && /initialize\s*\(/.test(content) && !/setupDom\s*\(\s*\)/m.test(content)) {
    violations.push('DOM access (getElementById) without setupDom() separation');
  }

  return violations;
}

async function runScan() {
  const files = await discoverFiles(ROOT);
  const foundComponents = [];
  const violatingComponents = [];

  for (const rel of files) {
    const filePath = path.join(ROOT, rel);
    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (e) {
      console.warn('⚠️ Could not read:', rel);
      continue;
    }
    const name = rel.endsWith('.vue') ? path.basename(rel) : path.basename(rel, path.extname(rel));
    foundComponents.push({ file: rel, name });
    const violations = analyzeFile(content, rel);
    if (violations.length > 0) {
      violatingComponents.push({ file: rel, name, violations });
    }
  }

  const total = foundComponents.length;
  const compliant = total - violatingComponents.length;
  const rate = total > 0 ? ((compliant / total) * 100).toFixed(1) : '100';

  return {
    scannedFiles: files.length,
    foundComponents,
    violatingComponents,
    compliant,
    total,
    rate
  };
}

function printReport(results) {
  const { total, compliant, rate, violatingComponents, foundComponents } = results;
  console.log('\n📊 IM Compliance Scan\n');
  console.log(`   Components: ${total}`);
  console.log(`   Compliant:  ${compliant}`);
  console.log(`   Violating:  ${violatingComponents.length}`);
  console.log(`   Rate:      ${rate}% (${compliant}/${total})\n`);

  if (violatingComponents.length > 0) {
    console.log('❌ Violating components:\n');
    for (const c of violatingComponents) {
      console.log(`   ${c.name} (${c.file})`);
      c.violations.forEach(v => console.log(`      - ${typeof v === 'string' ? v : v.message || v.type || JSON.stringify(v)}`));
      console.log('');
    }
  }

  const compliantNames = foundComponents
    .filter(c => !violatingComponents.some(v => v.file === c.file))
    .map(c => c.name);
  if (compliantNames.length > 0) {
    console.log('✅ Compliant components:\n');
    console.log('   ' + compliantNames.join(', ') + '\n');
  }
}

function markdownFragment(results) {
  const { total, compliant, rate, violatingComponents, foundComponents } = results;
  const compliantList = foundComponents
    .filter(c => !violatingComponents.some(v => v.file === c.file))
    .map(c => `- ${c.name} (${c.file})`);
  const violatingList = violatingComponents.map(c => {
    const vs = c.violations.map(v => typeof v === 'string' ? v : v.message || v.type || '-').join('; ');
    return `- ${c.name} (${c.file}): ${vs}`;
  });
  return `# IM Compliance Summary (generated)

- **Total**: ${total}
- **Compliant**: ${compliant}
- **Violating**: ${violatingComponents.length}
- **Rate**: ${rate}% (${compliant}/${total})

## Compliant

${compliantList.join('\n')}

## Violating

${violatingList.join('\n')}
`;
}

async function main() {
  const writeFragment = process.argv.includes('--write-fragment');
  const results = await runScan();
  printReport(results);
  if (writeFragment) {
    const fragmentPath = path.join(ROOT, 'docs', 'im', 'compliance-summary-fragment.md');
    const { writeFile } = await import('fs/promises');
    await writeFile(fragmentPath, markdownFragment(results), 'utf-8');
    console.log('Wrote ' + fragmentPath);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
