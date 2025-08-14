# Bidirectional Header Scroll System - Implementation Guide

## Overview

The resume-flock application now implements a complete bidirectional synchronization system where:

- **rDiv selection** → scrolls **cDiv header elements** into view
- **cDiv selection** → scrolls **rDiv header elements** into view

This ensures that when a user selects either a resume item (rDiv) or a business card (cDiv), the corresponding element on the other side becomes visible with its header elements prominently displayed.

## Architecture

### Core Components

1. **selectionManager.mjs** - Central event dispatcher
2. **useCardsController.mjs** - Handles cDiv/rDiv synchronization and scrolling
3. **ResumeListController.mjs** - Handles rDiv click events
4. **Source Parameter System** - Determines scroll direction

### Event Flow

```
User Action → selectionManager.selectJobNumber(jobNumber, source) → 
handleJobSelected(event) → Source Detection → Appropriate Header Scroll Function
```

## Implementation Details

### Header Element Targeting

#### cDiv Header Elements (in priority order):
- `.biz-details-employer` - Primary header (employer name)
- `.biz-card-header` - Alternative header
- `.job-title` - Job title header  
- `.company-name` - Company name header
- `.biz-details-role` - Role description header

#### rDiv Header Elements (in priority order):
- `.biz-resume-details-div` - Primary resume header
- `.resume-header` - Alternative header
- `.job-title` - Job title header
- `.company-name` - Company name header

### Source Parameter Detection

The system uses source parameters to determine scroll direction:

- **`ResumeListController.handleBizResumeDivClickEvent`** → Triggers cDiv header scroll
- **`CardsController.cardClick`** → Triggers rDiv header scroll
- **Other sources** → Default to cDiv header scroll (backward compatibility)

### Scroll Functions

#### `scrollCDivHeaderIntoView(jobNumber)`
1. Finds the card element for the job number
2. Searches for header elements using priority selectors
3. Handles hidden cards (temporarily shows for scrolling)
4. Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })`

#### `scrollRDivHeaderIntoView(jobNumber)`
1. Finds the resume div for the job number
2. Searches for header elements using priority selectors  
3. Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })`

## Testing Instructions

### Automated Testing

1. **Load the test suite** in browser console:
   ```javascript
   // Copy and paste the contents of run-header-scroll-tests.js
   runHeaderScrollTests()
   ```

2. **Run comprehensive tests**:
   ```javascript
   // Copy and paste the contents of test-bidirectional-sync.js
   runBidirectionalSyncTests()
   ```

### Manual Testing

1. **Basic System Check**:
   ```javascript
   quickVerify()
   ```

2. **Test rDiv → cDiv sync**:
   ```javascript
   window.selectionManager.selectJobNumber(5, 'ResumeListController.handleBizResumeDivClickEvent')
   ```
   *Expected: cDiv header for job 5 scrolls into view*

3. **Test cDiv → rDiv sync**:
   ```javascript
   window.selectionManager.selectJobNumber(8, 'CardsController.cardClick')
   ```
   *Expected: rDiv header for job 8 scrolls into view*

4. **Live Click Testing**:
   - Click any resume item on the right side
   - Expected: Corresponding card header scrolls into view on the left side
   - Click any business card on the left side  
   - Expected: Corresponding resume header scrolls into view on the right side

### Debug Functions

- `window.debugSelectionSync()` - Complete system status
- `window.testRDivToCDivSync(jobNumber)` - Test specific rDiv → cDiv sync
- `window.testScrollCDiv(jobNumber)` - Test cDiv scroll directly

## Expected Console Output

### Successful rDiv → cDiv Sync:
```
[CardsController] 🎯 handleJobSelected CALLED! {jobNumber: 5, source: "ResumeListController.handleBizResumeDivClickEvent"}
[CardsController] 📜 rDiv selected → scrolling cDiv header for job 5
[useCardsController] 📜 SCROLL: Attempting to scroll cDiv HEADER into view for job 5
[useCardsController] 📜 Found cDiv header element: .biz-details-employer
[useCardsController] ✅ cDiv header scrolled into view
```

### Successful cDiv → rDiv Sync:
```
[CardsController] 🎯 handleJobSelected CALLED! {jobNumber: 8, source: "CardsController.cardClick"}
[CardsController] 📜 cDiv selected → scrolling rDiv header for job 8  
[useCardsController] 📜 SCROLL: Attempting to scroll rDiv HEADER into view for job 8
[useCardsController] 📜 Found rDiv header element: .biz-resume-details-div
[useCardsController] ✅ rDiv header scrolled into view for job 8
```

## Troubleshooting

### Common Issues

1. **No scroll detected**:
   - Check if `window.selectionManager` exists
   - Verify event listeners are set up: `window._cardsControllerListenersReady`
   - Run `debugSelectionSync()` for detailed status

2. **Wrong scroll direction**:
   - Check source parameter in console logs
   - Verify source detection logic in `handleJobSelected()`

3. **Header elements not found**:
   - Inspect DOM structure of resume/card elements
   - Verify header selectors match actual HTML structure
   - Add custom selectors if needed

4. **Scroll not visible**:
   - Check if target element is already visible
   - Verify scroll container is the correct parent element
   - Test with elements that are clearly off-screen

### Debug Steps

1. Run system verification: `quickVerify()`
2. Check detailed status: `window.debugSelectionSync()`
3. Test individual functions: `window.testRDivToCDivSync(5)`
4. Monitor console logs during manual clicks
5. Verify header element detection with browser inspector

## Performance Considerations

- **Timeout Delays**: 100ms delay before scroll execution allows DOM updates
- **Header Detection**: Priority-based selector search for optimal performance
- **Hidden Element Handling**: Temporary visibility for accurate scroll positioning
- **Smooth Scrolling**: Native `scrollIntoView` for best browser compatibility

## Future Enhancements

- Custom scroll animations
- Configurable header element selectors  
- Scroll position memory
- Keyboard navigation integration
- Mobile touch gesture support

## File Locations

- **Implementation**: `/modules/composables/useCardsController.mjs` (lines 708-1018)
- **Event Handling**: `/modules/core/selectionManager.mjs` (lines 41-87)
- **Test Suite**: `/test-bidirectional-sync.js`
- **Test Runner**: `/run-header-scroll-tests.js`
- **Manual Tests**: `/MANUAL-TEST-INSTRUCTIONS.md`

## Success Criteria

✅ **Functional Requirements Met:**
- rDiv selection scrolls cDiv header into view
- cDiv selection scrolls rDiv header into view  
- Header elements are properly targeted and centered
- Source parameter detection works correctly
- Manual clicks trigger appropriate scroll behavior

✅ **Technical Requirements Met:**
- Clean separation of concerns
- Event-driven architecture
- Error handling and fallbacks
- Cross-browser compatibility
- Performance optimized

✅ **User Experience Requirements Met:**
- Smooth scrolling animations
- Centered header positioning
- Visual feedback during scroll
- No disruption to existing functionality
- Intuitive bidirectional behavior