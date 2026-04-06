// Define a global no-op function to easily disable console logs without removing the calls
// @ts-ignore
window.CONSOLE_LOG_IGNORE = () => {};
// @ts-ignore
window.CONSOLE_INFO_IGNORE = () => {};

// Ensure hasServer singleton is attached to window (self-initializes on first call)
import './modules/core/hasServer.mjs';

// Mark <body> immediately so CSS can hide server-only UI on static hosts.
if (typeof window !== 'undefined' && !window.hasServer()) {
    document.documentElement.classList.add('static-host');
}

// Create centralized logging control system
// 
// Usage:
// - All console.log, console.warn, console.error are suppressed except job numbers
// - Use window.LOG_JOB(jobNumber, context) to log job info in clean format
// - Output format: "JobNum | JobName | Y:centerY | Dist:distance | context"
// - Toggle with window.LOGGING_CONTROL.toggle() or window.LOGGING_CONTROL.toggleFormat()
//
// @ts-ignore
window.LOGGING_CONTROL = {
  suppressAllExceptJobNumbers: false,
  jobNumberFormat: 'single-column', // 'single-column' | 'detailed'
  
  // Override all console methods to suppress everything except job numbers
  init() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    
    // Store originals for potential restoration
    this._originals = { log: originalLog, warn: originalWarn, error: originalError, info: originalInfo, debug: originalDebug };
    
    // Override console methods
    console.log = (...args) => {
      if (!this.suppressAllExceptJobNumbers) {
        originalLog(...args);
        return;
      }
      
      // Check if this is a job number log we want to keep
      const message = args.join(' ');
      if (this.isJobNumberLog(message, args)) {
        this.logJobNumber(message, args, originalLog);
      }
      // Otherwise suppress the log
    };
    
    console.warn = (...args) => {
      if (!this.suppressAllExceptJobNumbers) {
        originalWarn(...args);
        return;
      }
      // Suppress all warnings when in job-only mode
    };
    
    console.error = (...args) => {
      if (!this.suppressAllExceptJobNumbers) {
        originalError(...args);
        return;
      }
      // Suppress all errors when in job-only mode  
    };
    
    console.info = (...args) => {
      if (!this.suppressAllExceptJobNumbers) {
        originalInfo(...args);
      }
      // Suppress all info when in job-only mode
    };
    
    console.debug = (...args) => {
      if (!this.suppressAllExceptJobNumbers) {
        originalDebug(...args);
      }
      // Suppress all debug when in job-only mode
    };
  },
  
  // Check if a log message is about job numbers that we want to preserve
  isJobNumberLog(message: string, args: any[]) {
    const lowerMessage = message.toLowerCase();
    
    // Look for job number patterns
    const jobPatterns = [
      /job\s*\d+/i,
      /jobnumber[:\s=]*\d+/i,
      /data-job-number/i,
      /selectedjobnumber/i,
      /jobindex/i,
      /scrolling.*to.*job/i,
      /found.*job.*\d+/i,
      /job.*\d+.*skills/i
    ];
    
    return jobPatterns.some(pattern => pattern.test(message));
  },
  
  // Log job numbers in clean single column format
  logJobNumber(message: string, args: any[], originalLog: typeof console.log) {
    if (this.jobNumberFormat === 'single-column') {
      // Extract job number from the message
      const jobNumberMatch = message.match(/job\s*(\d+)|jobnumber[:\s=]*(\d+)|job.*(\d+)/i);
      if (jobNumberMatch) {
        const jobNum = jobNumberMatch[1] || jobNumberMatch[2] || jobNumberMatch[3];
        
        // Try to get additional job details if available
        const jobDetails = this.getJobDetails(jobNum);
        if (jobDetails) {
          originalLog(`${jobNum}`);
        } else {
          originalLog(`${jobNum}`);
        }
      } else {
        // If we can't extract a clean job number, show the original but simplified
        const cleanMessage = message.replace(/\[.*?\]/g, '').replace(/^\s*-?\s*/, '').trim();
        if (cleanMessage) {
          // Check if this contains job positioning info we want to show
          if (this.isPositioningInfo(cleanMessage)) {
            originalLog(cleanMessage);
          }
        }
      }
    } else {
      // Detailed format - show original message
      originalLog(...args);
    }
  },
  
  // Check if message contains positioning info we want to preserve
  isPositioningInfo(message: string) {
    return /centery|distance.*cdiv|top:|position/i.test(message);
  },
  
  // Get job details from DOM if available (name, centerY, distance)
  getJobDetails(jobNum: string | number) {
    try {
      const card = document.querySelector(`[data-job-number="${jobNum}"]`);
      if (!card) return null;
      
      const roleElement = card.querySelector('.biz-details-role');
      const centerY = card.getAttribute('data-sceneCenterY');
      
      if (roleElement && centerY) {
        const role = roleElement.textContent?.trim() || 'Unknown Role';
        
        // Calculate distance to reference cDiv if available
        const selectedCard = document.querySelector('.biz-card-div.selected');
        let distance = 'N/A';
        if (selectedCard) {
          const selectedCenterY = selectedCard.getAttribute('data-sceneCenterY');
          if (selectedCenterY) {
            distance = Math.abs(parseFloat(centerY) - parseFloat(selectedCenterY)).toFixed(1);
          }
        }
        
        return {
          name: role,
          centerY: parseFloat(centerY).toFixed(1),
          distance: distance
        };
      }
    } catch (e) {
      // Ignore errors when DOM is not ready
    }
    return null;
  },
  
  // Method to restore original console behavior
  restore() {
    if (this._originals) {
      console.log = this._originals.log;
      console.warn = this._originals.warn;
      console.error = this._originals.error;
      console.info = this._originals.info;
      console.debug = this._originals.debug;
    }
  },
  
  // Method to toggle suppression mode
  toggle() {
    this.suppressAllExceptJobNumbers = !this.suppressAllExceptJobNumbers;
    if (this.suppressAllExceptJobNumbers) {
      this._originals.log('Logging suppressed - showing only job numbers');
    } else {
      this._originals.log('Full logging restored');
    }
  },
  
  // Method to toggle job number format
  toggleFormat() {
    this.jobNumberFormat = this.jobNumberFormat === 'single-column' ? 'detailed' : 'single-column';
    this._originals.log(`Job number format: ${this.jobNumberFormat}`);
  },
  
  // Global utility function to log job numbers consistently
  logJob(jobNumber: string | number, context: string = '') {
    if (!this.suppressAllExceptJobNumbers) {
      this._originals.log(`LOG_JOB: Suppression disabled, not logging job ${jobNumber}`);
      return;
    }
    
    const jobDetails = this.getJobDetails(jobNumber);
    if (jobDetails) {
      this._originals.log(`${jobNumber} | ${jobDetails.name} | Y:${jobDetails.centerY} | Dist:${jobDetails.distance}${context ? ' | ' + context : ''}`);
    } else {
      this._originals.log(`${jobNumber}${context ? ' | ' + context : ''}`);
    }
  }
};

// Global function for easy job number logging
// @ts-ignore
window.LOG_JOB = (jobNumber, context = '') => {
  // @ts-ignore
  window.LOGGING_CONTROL.logJob(jobNumber, context);
};

// Initialize the logging control system
// @ts-ignore
window.LOGGING_CONTROL.init();

// Test LOG_JOB function on startup
// @ts-ignore
window.LOG_JOB(2, 'test log on startup');

// import './styles/timeline.css'; // Removed - now using Vue component
import './styles/core.css'; // Import core styles for BullsEye and other components
// Debug scripts moved to /tmp during Vue 3 migration cleanup

// Create global element registry BEFORE anything else
import { createGlobalElementRegistry } from './modules/composables/useGlobalElementRegistry.mjs';

// TypeScript declarations for window globals
declare global {
  interface Window {
    globalElementRegistry: ReturnType<typeof createGlobalElementRegistry>;
    hasServer(): boolean;
  }
}

window.globalElementRegistry = createGlobalElementRegistry();
console.log('[main.ts] ✅ Global element registry created and attached to window');

import { createApp } from 'vue';
// @ts-ignore
import App from './App.vue';

if (typeof window.CONSOLE_LOG_IGNORE === 'function') {
  window.CONSOLE_LOG_IGNORE('main.ts: About to create Vue app');
}
// or in the App.vue component's onMounted hook.

// --- Vue App Initialization ---
const app = createApp(App);
window.CONSOLE_LOG_IGNORE('main.ts: Vue app created, about to mount');
app.mount('#app');
window.CONSOLE_LOG_IGNORE('main.ts: Vue app mounted');


window.CONSOLE_LOG_IGNORE('Vue root app mounted.');
