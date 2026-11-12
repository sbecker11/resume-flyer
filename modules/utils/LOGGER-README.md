# Logger System

Centralized logging system with configurable log levels.

## Usage

```javascript
import { logger } from '../utils/logger.mjs'

// Replace console.debug with logger.debug
logger.debug('[MyComponent] Debug message')

// Replace console.info with logger.info
logger.info('[MyComponent] Info message')

// Replace console.warn with logger.warn
logger.warn('[MyComponent] Warning message')

// Replace console.error with logger.error
logger.error('[MyComponent] Error message')

// Always log (ignores log level)
logger.log('[MyComponent] Always shown')
```

## Log Levels

- **SILENT** (0) - No logs
- **ERROR** (1) - Only errors
- **WARN** (2) - Errors + warnings (default in both development and production)
- **INFO** (3) - Errors + warnings + info
- **DEBUG** (4) - All logs (opt in via `window.setLogLevel('DEBUG')`, `localStorage.LOG_LEVEL`, or `VITE_LOG_LEVEL`)

## Configuration

### 1. Environment Variable (Build-time)

Create/edit `.env` file:
```bash
VITE_LOG_LEVEL=DEBUG  # or SILENT, ERROR, WARN, INFO
```

### 2. Runtime (Browser Console)

```javascript
// Set log level
window.setLogLevel('DEBUG')   // or 'SILENT', 'ERROR', 'WARN', 'INFO'
window.setLogLevel(4)          // or use numeric value

// Get current log level
window.getLogLevel()  // { level: 4, name: 'DEBUG' }
```

### 3. Programmatic

```javascript
import { setLogLevel, LOG_LEVELS } from '../utils/logger.mjs'

setLogLevel('WARN')
// or
setLogLevel(LOG_LEVELS.WARN)
```

## Migration Guide

Replace existing console calls:

```javascript
// Before
console.debug('[Component] message')
console.info('[Component] message')
console.warn('[Component] message')
console.error('[Component] message')

// After
import { logger } from '../utils/logger.mjs'

logger.debug('[Component] message')
logger.info('[Component] message')
logger.warn('[Component] message')
logger.error('[Component] message')
```

## Examples

### Example 1: Component with debug logging

```javascript
import { logger } from '../utils/logger.mjs'

export function useMyComponent() {
  const initialize = () => {
    logger.debug('[MyComponent] Initializing...')

    try {
      // ... do work ...
      logger.info('[MyComponent] Initialized successfully')
    } catch (error) {
      logger.error('[MyComponent] Initialization failed:', error)
    }
  }

  return { initialize }
}
```

### Example 2: Performance monitoring

```javascript
import { logger } from '../utils/logger.mjs'

function expensiveOperation() {
  const start = performance.now()
  // ... do work ...
  const duration = performance.now() - start

  if (duration > 16) {
    logger.warn(`[Performance] Slow operation: ${duration.toFixed(2)}ms`)
  } else {
    logger.debug(`[Performance] Operation completed: ${duration.toFixed(2)}ms`)
  }
}
```

## Benefits

1. **Production Performance**: Console calls can be expensive - log level filtering reduces overhead
2. **Clean Console**: Only see logs you care about
3. **Runtime Control**: Change log level without rebuilding
4. **Persistent Settings**: Log level saved to localStorage
5. **Easy Migration**: Drop-in replacement for console methods
