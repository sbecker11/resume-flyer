// Updated JavaScript function for browser console (no extra padding)
function getYCoordinateForDate(dateString) {
    // Parse the date string (YYYY-MM-DD format)
    const targetDate = new Date(dateString + 'T00:00:00.000Z');
    
    // Convert date to fractional year
    function dateToFractionalYear(date) {
        return date.getFullYear() + 
               date.getMonth()/12 + 
               date.getDate()/365.25/12;
    }
    
    // Timeline bounds (matching your specifications)
    // Bottom: Earliest job start date - 1 year = 1986-09-01
    // Top: CURRENT_DATE + 1 year
    const earliestJobStart = new Date('1987-09-01T00:00:00.000Z');
    const timelineStartDate = new Date(earliestJobStart);
    timelineStartDate.setFullYear(timelineStartDate.getFullYear() - 1); // 1986-09-01
    
    const today = new Date();
    const timelineEndDate = new Date(today);
    timelineEndDate.setFullYear(timelineEndDate.getFullYear() + 1);
    
    // Convert to fractional years
    const startYear = dateToFractionalYear(timelineStartDate);
    const endYear = dateToFractionalYear(timelineEndDate);
    const targetYear = dateToFractionalYear(targetDate);
    
    // Timeline constants
    const YEAR_HEIGHT = 200;
    const TIMELINE_PADDING_TOP = 0;
    const timelineHeight = ((endYear - startYear) * YEAR_HEIGHT) + TIMELINE_PADDING_TOP;
    
    // No extra padding - timeline bounds already include 1-year buffers
    const topPosition = TIMELINE_PADDING_TOP; // 0
    const bottomPosition = timelineHeight;
    
    // Linear interpolation function
    function linearInterp(x, x0, y0, x1, y1) {
        return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
    }
    
    // Calculate Y position
    const yPosition = linearInterp(
        targetYear,      // x: target date as fractional year
        startYear,       // x0: timeline start (bottom)
        bottomPosition,  // y0: bottom pixel position
        endYear,         // x1: timeline end (top)  
        topPosition     // y1: top pixel position (0)
    );
    
    // Return detailed information
    const result = {
        inputDate: dateString,
        parsedDate: targetDate.toISOString(),
        yPosition: yPosition,
        distanceFromTop: yPosition - topPosition, // Same as yPosition since topPosition = 0
        timelineBounds: {
            bottom: timelineStartDate.toISOString().split('T')[0],
            top: timelineEndDate.toISOString().split('T')[0]
        },
        fractionalYear: targetYear,
        timelineHeight: timelineHeight
    };
    
    console.log(`Y coordinate for ${dateString}:`, yPosition);
    console.log('Full details:', result);
    
    return yPosition;
}

// Updated simplified one-liner (no padding)
function getY(date) {
    const d = new Date(date + 'T00:00:00.000Z');
    const fYear = d.getFullYear() + d.getMonth()/12 + d.getDate()/365.25/12;
    const start = 1986.590406; // 1986-09-01 fractional
    const end = new Date().getFullYear() + 1 + (new Date().getMonth()/12) + (new Date().getDate()/365.25/12);
    const height = (end - start) * 200;
    return height * (end - fYear) / (end - start); // No padding added
}

// Usage examples:
// getYCoordinateForDate('2025-08-01')
// getYCoordinateForDate('2025-07-21') // Today
// getYCoordinateForDate('2026-07-21') // Should be at Y=0 (top of timeline)
// getYCoordinateForDate('1986-09-01') // Should be at bottom of timeline