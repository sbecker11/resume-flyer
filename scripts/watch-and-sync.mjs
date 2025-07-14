#!/usr/bin/env node

/**
 * Watch and Sync Script
 * Watches for changes in Vue components and CSS files, then automatically syncs with Figma
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractDesignTokens } from './extract-design-tokens.mjs';
import { syncWithFigma } from './figma-sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Debounce function to prevent excessive syncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Track last sync time to prevent rapid consecutive syncs
let lastSyncTime = 0;
const MIN_SYNC_INTERVAL = 5000; // 5 seconds

/**
 * Handle file changes
 */
const handleFileChange = debounce(async (eventType, filename) => {
  const now = Date.now();
  
  // Skip if too soon since last sync
  if (now - lastSyncTime < MIN_SYNC_INTERVAL) {
    window.CONSOLE_LOG_IGNORE(`⏱️  Skipping sync - too soon since last sync (${Math.round((now - lastSyncTime) / 1000)}s ago)`);
    return;
  }
  
  window.CONSOLE_LOG_IGNORE(`\n📝 File changed: ${filename} (${eventType})`);
  window.CONSOLE_LOG_IGNORE('🔄 Extracting design tokens and syncing with Figma...');
  
  try {
    // Extract tokens and sync
    await extractDesignTokens();
    await syncWithFigma();
    
    lastSyncTime = now;
    window.CONSOLE_LOG_IGNORE('✅ Sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  }
}, 2000); // 2 second debounce

/**
 * Watch directories for changes
 */
function watchDirectories() {
  const watchPaths = [
    path.join(projectRoot, 'modules', 'components'),
    path.join(projectRoot, 'modules', 'composables'),
    path.join(projectRoot, 'modules', 'palettes'),
    path.join(projectRoot, 'styles.css')
  ];
  
  const watchers = [];
  
  watchPaths.forEach(watchPath => {
    if (fs.existsSync(watchPath)) {
      const stats = fs.statSync(watchPath);
      
      if (stats.isDirectory()) {
        window.CONSOLE_LOG_IGNORE(`👀 Watching directory: ${watchPath}`);
        const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
          if (filename && (filename.endsWith('.vue') || filename.endsWith('.js') || filename.endsWith('.mjs') || filename.endsWith('.json'))) {
            handleFileChange(eventType, path.join(watchPath, filename));
          }
        });
        watchers.push(watcher);
        
      } else if (stats.isFile()) {
        window.CONSOLE_LOG_IGNORE(`👀 Watching file: ${watchPath}`);
        const watcher = fs.watch(watchPath, handleFileChange);
        watchers.push(watcher);
      }
    } else {
      window.CONSOLE_LOG_IGNORE(`⚠️  Warning: ${watchPath} does not exist`);
    }
  });
  
  return watchers;
}

/**
 * Setup graceful shutdown
 */
function setupShutdown(watchers) {
  process.on('SIGINT', () => {
    window.CONSOLE_LOG_IGNORE('\n🛑 Shutting down watchers...');
    watchers.forEach(watcher => watcher.close());
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    window.CONSOLE_LOG_IGNORE('\n🛑 Shutting down watchers...');
    watchers.forEach(watcher => watcher.close());
    process.exit(0);
  });
}

/**
 * Main function
 */
async function startWatching() {
  window.CONSOLE_LOG_IGNORE('🚀 Starting Figma design token watcher...');
  window.CONSOLE_LOG_IGNORE('📊 This will monitor your Vue components and CSS files for changes');
  window.CONSOLE_LOG_IGNORE('🔄 When changes are detected, design tokens will be extracted and synced with Figma');
  window.CONSOLE_LOG_IGNORE('⏱️  Minimum sync interval: 5 seconds');
  window.CONSOLE_LOG_IGNORE('🛑 Press Ctrl+C to stop watching\n');
  
  // Initial sync
  try {
    window.CONSOLE_LOG_IGNORE('🔄 Running initial sync...');
    await extractDesignTokens();
    await syncWithFigma();
    window.CONSOLE_LOG_IGNORE('✅ Initial sync completed!\n');
  } catch (error) {
    console.error('❌ Initial sync failed:', error.message);
    window.CONSOLE_LOG_IGNORE('⚠️  Continuing with file watching...\n');
  }
  
  // Start watching
  const watchers = watchDirectories();
  setupShutdown(watchers);
  
  window.CONSOLE_LOG_IGNORE('✅ Watcher started! Monitoring for changes...');
  
  // Keep the process alive
  setInterval(() => {
    // Heartbeat to keep process alive
  }, 30000);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWatching();
}

export { startWatching };