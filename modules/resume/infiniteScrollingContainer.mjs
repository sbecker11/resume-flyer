// modules/resume/infiniteScrollingContainer.mjs
// SIMPLIFIED VERSION - Native flexbox flow with no positioning

import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { selectionManager } from '../core/selectionManager.mjs';

class InfiniteScrollingContainer {
  constructor(scrollportElement, contentElement, options = {}) {
    this.scrollport = scrollportElement;
    this.contentHolder = contentElement;
    this.options = {
      onItemChange: options.onItemChange || null,
      ...options
    };

    this.originalItems = [];
    this.currentIndex = 0;
    this._isInitialized = false;

    this.init();
  }

  init() {
    this.setupContainer();
    console.log('[InfiniteScrollingContainer] Initialized with native flexbox flow');
  }

  setupContainer() {
    console.log('[DEBUG] InfiniteScrollingContainer: Using native flexbox flow - no positioning');
    
    // Set up scrollport for native scrolling
    this.scrollport.style.position = 'relative';
    this.scrollport.style.overflowY = 'auto';
    this.scrollport.style.overflowX = 'hidden'; // Prevent horizontal scrolling
    this.scrollport.style.backgroundColor = 'var(--grey-dark-6)';
    
    // Set up content holder as flexbox container
    this.contentHolder.style.backgroundColor = 'var(--grey-dark-6)';
    this.contentHolder.style.position = 'relative';
    this.contentHolder.style.width = '100%';
    this.contentHolder.style.height = 'auto'; // Let content determine height
    this.contentHolder.style.display = 'flex';
    this.contentHolder.style.flexDirection = 'column';
    this.contentHolder.style.alignItems = 'stretch';
  }

  setItems(items, startingIndex = 0) {
    console.log(`[DEBUG] InfiniteScrollingContainer.setItems: ${items.length} items with native flexbox`);
    
    this.originalItems = [...items];
    
    // Clear existing content
    this.contentHolder.innerHTML = '';
    
    // Add all items to container with flexbox flow
    this.originalItems.forEach((item, index) => {
      if (item) {
        // Remove any existing positioning styles
        this.clearPositioningStyles(item);
        
        // Set flexbox child properties
        item.style.position = 'relative';
        item.style.width = '100%';
        item.style.height = 'auto';
        item.style.flexShrink = '0';
        
        // Append to container
        this.contentHolder.appendChild(item);
      }
    });
    
    console.log(`[DEBUG] InfiniteScrollingContainer: Added ${this.originalItems.length} items to flexbox container`);
  }

  clearPositioningStyles(element) {
    // Remove all positioning styles to allow flexbox
    element.style.removeProperty('position');
    element.style.removeProperty('top'); 
    element.style.removeProperty('left');
    element.style.removeProperty('height');
    element.style.removeProperty('width');
    
    // Remove any transform styles
    element.style.removeProperty('transform');
  }

  scrollToIndex(originalIndex, animate = true) {
    console.log(`[DEBUG] scrollToIndex: ${originalIndex} with animate=${animate}`);
    
    if (originalIndex < 0 || originalIndex >= this.originalItems.length) {
      console.warn(`[DEBUG] scrollToIndex: Invalid index ${originalIndex}`);
      return;
    }
    
    const targetItem = this.originalItems[originalIndex];
    if (targetItem) {
      targetItem.scrollIntoView({ 
        behavior: animate ? 'smooth' : 'auto', 
        block: 'center' 
      });
      
      this.currentIndex = originalIndex;
      
      if (this.options.onItemChange) {
        this.options.onItemChange(originalIndex, targetItem);
      }
    }
  }

  scrollToItem(index, caller = '') {
    return this.scrollToIndex(index, true);
  }

  scrollToBizResumeDiv(bizResumeDiv, animate = true) {
    const index = this.originalItems.findIndex(item => item === bizResumeDiv);
    if (index !== -1) {
      this.scrollToIndex(index, animate);
      return true;
    }
    return false;
  }

  scrollToJobNumber(jobNumber, animate = true) {
    const index = this.originalItems.findIndex(item => {
      const itemJobNumber = parseInt(item.getAttribute('data-job-number'), 10);
      return itemJobNumber === jobNumber;
    });
    
    if (index !== -1) {
      this.scrollToIndex(index, animate);
      return true;
    }
    return false;
  }

  recalculateHeights() {
    // No-op for flexbox - heights are automatic
    console.log('[DEBUG] recalculateHeights: No-op with flexbox flow');
  }

  recalculateHeightsAfterPalette() {
    // No-op for flexbox - palette changes don't affect layout
    console.log('[DEBUG] recalculateHeightsAfterPalette: No-op with flexbox flow');
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getCurrentItem() {
    return this.originalItems[this.currentIndex] || null;
  }

  getItemAtIndex(index) {
    return this.originalItems[index] || null;
  }

  // Method for compatibility with legacy sorting code
  getCurrentlyVisibleJob() {
    // Return the current job number from the currently visible item
    const currentItem = this.getCurrentItem();
    if (currentItem) {
      const jobNumber = parseInt(currentItem.getAttribute('data-job-number'), 10);
      return isNaN(jobNumber) ? null : jobNumber;
    }
    return null;
  }

  goToNext() {
    const nextIndex = (this.currentIndex + 1) % this.originalItems.length;
    this.scrollToIndex(nextIndex);
  }

  goToPrevious() {
    const prevIndex = (this.currentIndex - 1 + this.originalItems.length) % this.originalItems.length;
    this.scrollToIndex(prevIndex);
  }

  goToFirst() {
    this.scrollToIndex(0);
    return this.originalItems[0];
  }

  goToLast() {
    this.scrollToIndex(this.originalItems.length - 1);
    return this.originalItems[this.originalItems.length - 1];
  }

  isInitialized() {
    return this._isInitialized;
  }

  destroy() {
    // Clean up
    this.originalItems = [];
    this.currentIndex = 0;
    this._isInitialized = false;
  }

  // Static methods for singleton compatibility
  static reset() {
    if (InfiniteScrollingContainer.instance) {
      InfiniteScrollingContainer.instance.destroy();
      InfiniteScrollingContainer.instance = null;
    }
  }
}

export { InfiniteScrollingContainer };