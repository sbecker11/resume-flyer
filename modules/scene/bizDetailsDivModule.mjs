/**
 * Creates resume item detail divs (rDivs) showing job title and employer
 */

/**
 * Create a biz-resume-details-div with job information
 * @param {HTMLElement} bizResumeDiv - The parent resume item div
 * @param {HTMLElement} bizCardDiv - The corresponding scene card div
 * @returns {HTMLElement} The details div
 */
export function createBizResumeDetailsDiv(bizResumeDiv, bizCardDiv) {
  const jobNumber = bizCardDiv.getAttribute('data-job-number');
  console.log(`[bizDetailsDivModule] 🔨 Creating details div for job ${jobNumber}`);

  // Create main details container
  const bizResumeDetailsDiv = document.createElement('div');
  bizResumeDetailsDiv.className = 'biz-resume-details-div';

  // Get job data from bizCardDiv attributes
  const role = bizCardDiv.getAttribute('data-role') || 'Unknown Role';
  const employer = bizCardDiv.getAttribute('data-employer') || 'Unknown Employer';

  // Create close button with SVG icon
  const closeButton = document.createElement('button');
  closeButton.className = 'biz-resume-close-btn';
  closeButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  `;
  closeButton.title = 'Clear selection';
  closeButton.setAttribute('data-testid', 'close-button'); // For debugging
  closeButton.style.cssText = 'pointer-events: auto !important; min-width: 24px; min-height: 24px;'; // Ensure clickable and sized
  closeButton.onclick = (e) => {
    console.log('[bizDetailsDivModule] ✋ Close button clicked - deleting bizResumeDiv for job', jobNumber);
    e.stopPropagation();
    e.preventDefault();

    // Clear selection state first
    if (window.resumeFlock?.selectionManager) {
      console.log('[bizDetailsDivModule] Calling clearSelection');
      window.resumeFlock.selectionManager.clearSelection('biz-resume-close-btn');
    }

    // Remove the parent bizResumeDiv from DOM with scroll adjustment
    if (bizResumeDiv && bizResumeDiv.parentNode) {
      // Get the next sibling element BEFORE deletion
      const nextElement = bizResumeDiv.nextElementSibling;
      console.log('[bizDetailsDivModule] Next element after deletion:', nextElement?.className, nextElement?.id);

      // Remove the element
      bizResumeDiv.remove();
      console.log('[bizDetailsDivModule] ✅ Deleted bizResumeDiv for job', jobNumber);

      // Scroll the next element into view with padding at the top
      if (nextElement) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          // Get the scroll container
          const scrollContainer = document.querySelector('.resume-content-div, #resume-content-div');
          if (scrollContainer) {
            // Calculate position with 20px padding from top
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = nextElement.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;
            const currentScroll = scrollContainer.scrollTop;
            const targetScroll = currentScroll + relativeTop - 20; // 20px padding from top

            scrollContainer.scrollTop = Math.max(0, targetScroll);
            console.log('[bizDetailsDivModule] Scrolled next element with padding:', nextElement.className, 'targetScroll:', targetScroll);
          } else {
            // Fallback to scrollIntoView
            nextElement.scrollIntoView({
              behavior: 'auto',
              block: 'start',
              inline: 'nearest'
            });
            console.log('[bizDetailsDivModule] Fallback scroll for:', nextElement.className);
          }
        }, 0);
      } else {
        console.log('[bizDetailsDivModule] No next element to scroll to');
      }
    } else {
      console.warn('[bizDetailsDivModule] ⚠️ bizResumeDiv not found or already removed');
    }
  };

  // Create title element
  const titleDiv = document.createElement('div');
  titleDiv.className = 'biz-resume-title';
  titleDiv.textContent = role;

  // Create employer element
  const employerDiv = document.createElement('div');
  employerDiv.className = 'biz-resume-employer';
  employerDiv.textContent = employer;

  // Create debug row (for development)
  const sceneZSpan = document.createElement('span');
  sceneZSpan.className = 'r-div-scene-z';
  sceneZSpan.textContent = ` cZ:${bizCardDiv.getAttribute('data-sceneZ') ?? '?'}`;

  const debugRow = document.createElement('div');
  debugRow.className = 'biz-details-debug-row';
  debugRow.appendChild(document.createTextNode(`#${jobNumber}`));
  debugRow.appendChild(sceneZSpan);

  // Assemble the details div
  bizResumeDetailsDiv.appendChild(closeButton);
  bizResumeDetailsDiv.appendChild(titleDiv);
  bizResumeDetailsDiv.appendChild(employerDiv);
  bizResumeDetailsDiv.appendChild(debugRow);

  console.log(`[bizDetailsDivModule] ✅ Details div created for job ${jobNumber} with close button`);
  return bizResumeDetailsDiv;
}
