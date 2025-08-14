# Manual Testing Instructions for rDiv to cDiv Selection Sync

## How to Test the Issue

1. **Open the application in browser** (http://localhost:5173)

2. **Wait for full loading** (look for console messages indicating system is ready)

3. **Open browser console** (F12 → Console tab)

4. **Run diagnostic functions** in console:

### Step 1: System Status Check
```javascript
debugSelectionSync()
```

**Expected Output:**
- All systems should show as available
- selectionManager instances should be the same
- Resume and card divs should be found
- Event listeners should be ready

### Step 2: Test Resume Click Simulation
```javascript
testResumeClick(5)
```

**Expected Output:** Should see logs showing:
1. 🖱️ Resume div clicked!
2. 🚀 Dispatching job-selected event
3. 🎯 handleJobSelected CALLED!
4. 🎯 SCROLL: Attempting to scroll cDiv

### Step 3: Test Direct Selection
```javascript
window.selectionManager.selectJobNumber(8, 'manual-test')
```

**Expected Output:** Should see:
1. 🚀 Dispatching job-selected event
2. 🎯 handleJobSelected CALLED!
3. Scroll attempt (since source is not 'CardsController')

### Step 4: Quick Automated Test
```javascript
runQuickTest()
```

**This will run multiple tests automatically and report results**

## What to Look For

### ✅ SUCCESS INDICATORS:
- All debug functions available
- selectionManager instances are the same
- Event listeners are set up (🚀 All event listeners set up and ready!)
- Resume div clicks trigger the full chain
- Direct selection triggers card updates

### ❌ FAILURE INDICATORS:
- Functions not available
- selectionManager instances different
- Event listeners not ready
- Missing log entries in the chain
- No scroll attempts when expected

## Common Issues and Solutions

1. **Functions not available**: System may not be fully loaded yet, wait and try again

2. **selectionManager not same instance**: Import/export issue - need to verify singleton pattern

3. **Event listeners not ready**: Timing issue in useCardsController setup

4. **Events dispatched but not received**: Event listener setup problem

5. **Scroll attempted but fails**: Card registry or DOM element issues

## Expected Console Output on Success

When working correctly, you should see this sequence:
```
[useCardsController] 🎧 Setting up event listeners...
[useCardsController] ✅ Test event received - event system working!
[useCardsController] ✅ Added job-selected and selection-cleared listeners
[useCardsController] 🚀 All event listeners set up and ready!

[ResumeListController] 🖱️ Resume div clicked!
[ResumeListController] Selecting job 5
[SelectionManager] 🚀 Dispatching job-selected event for job 5, source: ResumeListController.handleBizResumeDivClickEvent
[CardsController] 🎯 handleJobSelected CALLED!
[CardsController] Scrolling cDiv into view for job 5 (source: ResumeListController.handleBizResumeDivClickEvent)
[useCardsController] 🎯 SCROLL: Attempting to scroll cDiv into view for job 5
```

## Manual Click Testing

You can also test by actually clicking resume items on the right side of the screen. With debugging enabled, you should see the same log sequence when clicking any resume item.

The goal is to identify exactly where the chain breaks down and fix that specific issue.