// modules/resume/infiniteScrollingContainer.mjs
// TRUE INFINITE SCROLLING - Creates illusion of infinite content with head/tail clones

import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { selectionManager } from '../core/selectionManager.mjs';

/**
 * Configuration constants for infinite scrolling behavior
 */
const INFINITE_SCROLL_CONFIG = {
  CLONE_COUNT: 10,              // Number of clones to create above and below
  SCROLL_BUFFER: 200,           // Pixels from edge to trigger repositioning
  REPOSITION_DELAY: 100,        // Delay before allowing next repositioning
  DEFAULT_ITEM_HEIGHT: 80       // Estimated item height for performance
};

/**
 * Container styles configuration
 */
const CONTAINER_STYLES = {
  scrollport: {
    position: 'relative',
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: 'var(--grey-dark-6)'
  },
  contentHolder: {
    backgroundColor: 'var(--grey-dark-6)',
    position: 'relative',
    width: '100%',
    height: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch'
  }
};

/**
 * InfiniteScrollingContainer - Provides true infinite scrolling with seamless wrapping
 */
class InfiniteScrollingContainer {
  /**
   * Create an infinite scrolling container
   * @param {HTMLElement} scrollportElement - The scrollable container element
   * @param {HTMLElement} contentElement - The content holder element
   * @param {Object} options - Configuration options
   * @param {Function} options.onItemChange - Callback when active item changes
   */
  constructor(scrollportElement, contentElement, options = {}) {
    this._validateConstructorParams(scrollportElement, contentElement);
    
    this.scrollport = scrollportElement;
    this.contentHolder = contentElement;
    this.options = {
      onItemChange: options.onItemChange || null,
      ...options
    };

    // State management
    this.originalItems = [];
    this.headClones = [];
    this.tailClones = [];
    this.currentIndex = 0;
    this._isInitialized = false;
    this.isRepositioning = false;

    this.init();
  }

  /**
   * Initialize the infinite scrolling container
   */
  init() {
    try {
      this.setupContainer();
      this.setupScrollListener();
      console.log('[InfiniteScrollingContainer] Initialized with true infinite scrolling');
    } catch (error) {
      console.error('[InfiniteScrollingContainer] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up container styling and layout
   */
  setupContainer() {
    console.log('[DEBUG] InfiniteScrollingContainer: Setting up infinite scrolling container');
    
    // Apply scrollport styles
    this._applyStyles(this.scrollport, CONTAINER_STYLES.scrollport);
    
    // Apply content holder styles
    this._applyStyles(this.contentHolder, CONTAINER_STYLES.contentHolder);
  }

  /**
   * Set up scroll event listener for boundary detection
   */
  setupScrollListener() {
    this.scrollport.addEventListener('scroll', () => {
      if (!this.isRepositioning && this.originalItems.length > 0) {
        this.checkScrollBoundaries();
      }
    });
  }

  /**
   * Set the items for infinite scrolling
   * @param {Array} items - Array of DOM elements to display
   * @param {number} startingIndex - Initial index to display (default: 0)
   */
  setItems(items, startingIndex = 0) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }
    
    console.log(`[DEBUG] InfiniteScrollingContainer.setItems: ${items.length} items with infinite scrolling`);
    
    this._resetState();
    this.originalItems = [...items];
    
    if (items.length === 0) {
      console.warn('[InfiniteScrollingContainer] No items provided');
      return;
    }
    
    this._buildInfiniteScrollStructure();
    this._isInitialized = true;
  }

  /**
   * Create head clones (items that appear above the original list)
   */
  createHeadClones() {
    const cloneCount = Math.min(INFINITE_SCROLL_CONFIG.CLONE_COUNT, this.originalItems.length);
    const sourceItems = this.originalItems.slice(-cloneCount);
    
    sourceItems.forEach((sourceItem, index) => {
      if (sourceItem) {
        const originalIndex = this.originalItems.length - cloneCount + index;
        const clone = this._createClone(sourceItem, 'head', originalIndex);
        this.headClones.push(clone);
        this.contentHolder.appendChild(clone);
      }
    });
  }

  /**
   * Create tail clones (items that appear below the original list)
   */
  createTailClones() {
    const cloneCount = Math.min(INFINITE_SCROLL_CONFIG.CLONE_COUNT, this.originalItems.length);
    const sourceItems = this.originalItems.slice(0, cloneCount);
    
    sourceItems.forEach((sourceItem, index) => {
      if (sourceItem) {
        const clone = this._createClone(sourceItem, 'tail', index);
        this.tailClones.push(clone);
        this.contentHolder.appendChild(clone);
      }
    });
  }

  /**
   * Create a clone of an item for infinite scrolling
   * @param {HTMLElement} sourceItem - The original item to clone
   * @param {string} cloneType - Type of clone ('head' or 'tail')
   * @param {number} originalIndex - Index of the original item
   * @returns {HTMLElement} The cloned element
   */
  _createClone(sourceItem, cloneType, originalIndex) {
    const clone = sourceItem.cloneNode(true);
    
    this._markAsClone(clone, cloneType, originalIndex);
    this._updateCloneIds(clone, cloneType);
    this.prepareItemForInfiniteScroll(clone, originalIndex, cloneType);
    this._applyPaletteToClone(clone);
    
    return clone;
  }

  /**
   * Prepare an item for infinite scrolling layout
   * @param {HTMLElement} item - The item to prepare
   * @param {number} index - The item's index
   * @param {string} type - The item type ('original', 'head', 'tail')
   */
  prepareItemForInfiniteScroll(item, index, type) {
    this._clearPositioningStyles(item);
    this._applyFlexboxStyles(item);
    this._addTrackingAttributes(item, index, type);
  }

  /**
   * Clear positioning styles from an element
   * @param {HTMLElement} element - The element to clear styles from
   */
  _clearPositioningStyles(element) {
    const propertiesToRemove = ['position', 'top', 'left', 'height', 'width', 'transform'];
    propertiesToRemove.forEach(prop => element.style.removeProperty(prop));
  }

  /**
   * Check if scrolling has approached boundaries and trigger repositioning
   */
  checkScrollBoundaries() {
    const { scrollTop, scrollHeight, clientHeight } = this.scrollport;
    const buffer = INFINITE_SCROLL_CONFIG.SCROLL_BUFFER;
    
    if (scrollTop < buffer) {
      console.log('[InfiniteScrollingContainer] Near top boundary - repositioning');
      this._repositionToBottom();
    } else if (scrollTop + clientHeight > scrollHeight - buffer) {
      console.log('[InfiniteScrollingContainer] Near bottom boundary - repositioning');
      this._repositionToTop();
    }
  }

  /**
   * Reposition scroll from top boundary to bottom equivalent position
   */
  _repositionToBottom() {
    if (this.isRepositioning) return;
    this._setRepositioning(true);
    
    const metrics = this._calculateRepositionMetrics();
    const currentScrollInOriginals = this.scrollport.scrollTop - metrics.headHeight;
    const newScrollTop = metrics.headHeight + metrics.originalHeight + currentScrollInOriginals;
    
    this.scrollport.scrollTop = newScrollTop;
    console.log(`[InfiniteScrollingContainer] Repositioned from top area to bottom: ${newScrollTop}px`);
    
    this._scheduleRepositioningReset();
  }

  /**
   * Reposition scroll from bottom boundary to top equivalent position
   */
  _repositionToTop() {
    if (this.isRepositioning) return;
    this._setRepositioning(true);
    
    const metrics = this._calculateRepositionMetrics();
    const currentScrollInTailClones = this.scrollport.scrollTop - metrics.headHeight - metrics.originalHeight;
    const newScrollTop = metrics.headHeight + currentScrollInTailClones;
    
    this.scrollport.scrollTop = newScrollTop;
    console.log(`[InfiniteScrollingContainer] Repositioned from bottom area to top: ${newScrollTop}px`);
    
    this._scheduleRepositioningReset();
  }

  /**
   * Calculate height of head clones with performance optimization
   * @returns {number} Total height of head clones
   */
  calculateHeadClonesHeight() {
    return this._calculateCollectionHeight(this.headClones);
  }

  /**
   * Calculate height of original content with performance optimization
   * @returns {number} Total height of original items
   */
  calculateOriginalContentHeight() {
    return this._calculateCollectionHeight(this.originalItems);
  }

  /**
   * Calculate height of tail clones with performance optimization
   * @returns {number} Total height of tail clones
   */
  calculateTailClonesHeight() {
    return this._calculateCollectionHeight(this.tailClones);
  }

  /**
   * Scroll to a specific item by index
   * @param {number} originalIndex - Index of the item to scroll to
   * @param {boolean} animate - Whether to animate the scroll
   */
  scrollToIndex(originalIndex, animate = true) {
    console.log(`[DEBUG] scrollToIndex: ${originalIndex} with animate=${animate}`);
    
    // Safety check: ensure originalItems array is populated
    if (!this.originalItems || this.originalItems.length === 0) {
      console.warn(`[InfiniteScrollingContainer] Cannot scroll - no items available (originalItems length: ${this.originalItems?.length || 0})`);
      return;
    }
    
    const wrappedIndex = this._wrapIndex(originalIndex);
    
    // Check if _wrapIndex returned invalid index (no items available)
    if (wrappedIndex === -1) {
      console.warn(`[InfiniteScrollingContainer] Cannot scroll - invalid wrapped index`);
      return;
    }
    
    const targetItem = this.originalItems[wrappedIndex];
    
    if (targetItem) {
      targetItem.scrollIntoView({ 
        behavior: animate ? 'smooth' : 'auto', 
        block: 'center' 
      });
      
      this.currentIndex = wrappedIndex;
      this._notifyItemChange(wrappedIndex, targetItem);
    } else {
      console.warn(`[InfiniteScrollingContainer] No item found at index ${wrappedIndex} (total items: ${this.originalItems.length})`);
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
    // Infinite scrolling - no bounds checking needed
    const nextIndex = this.currentIndex + 1;
    this.scrollToIndex(nextIndex);
  }

  goToPrevious() {
    // Infinite scrolling - no bounds checking needed  
    const prevIndex = this.currentIndex - 1;
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
    this.headClones = [];
    this.tailClones = [];
    this.currentIndex = 0;
    this._isInitialized = false;
    this.isRepositioning = false;
  }

  // Static methods for singleton compatibility
  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate constructor parameters
   * @param {HTMLElement} scrollportElement - Scrollport element to validate
   * @param {HTMLElement} contentElement - Content element to validate
   */
  _validateConstructorParams(scrollportElement, contentElement) {
    if (!scrollportElement || !(scrollportElement instanceof HTMLElement)) {
      throw new Error('Scrollport element must be a valid HTMLElement');
    }
    if (!contentElement || !(contentElement instanceof HTMLElement)) {
      throw new Error('Content element must be a valid HTMLElement');
    }
  }

  /**
   * Apply styles to an element
   * @param {HTMLElement} element - Element to style
   * @param {Object} styles - Style properties to apply
   */
  _applyStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
      element.style[property] = value;
    });
  }

  /**
   * Reset container state
   */
  _resetState() {
    this.contentHolder.innerHTML = '';
    this.headClones = [];
    this.tailClones = [];
    this.currentIndex = 0;
    this.isRepositioning = false;
  }

  /**
   * Build the complete infinite scroll structure
   */
  _buildInfiniteScrollStructure() {
    this.createHeadClones();
    this._addOriginalItems();
    this.createTailClones();
    
    console.log(`[DEBUG] InfiniteScrollingContainer: Created infinite scroll structure - ${this.headClones.length} head clones + ${this.originalItems.length} originals + ${this.tailClones.length} tail clones`);
  }

  /**
   * Add original items to the container
   */
  _addOriginalItems() {
    this.originalItems.forEach((item, index) => {
      if (item) {
        this.prepareItemForInfiniteScroll(item, index, 'original');
        this.contentHolder.appendChild(item);
      }
    });
  }

  /**
   * Mark an element as a clone with appropriate attributes
   * @param {HTMLElement} clone - The cloned element
   * @param {string} cloneType - Type of clone ('head' or 'tail')
   * @param {number} originalIndex - Index of the original item
   */
  _markAsClone(clone, cloneType, originalIndex) {
    clone.classList.add('infinite-scroll-clone', `${cloneType}-clone`);
    clone.dataset.originalIndex = originalIndex.toString();
    clone.dataset.cloneType = cloneType;
  }

  /**
   * Update IDs in cloned elements to avoid duplicates
   * @param {HTMLElement} clone - The cloned element
   * @param {string} cloneType - Type of clone ('head' or 'tail')
   */
  _updateCloneIds(clone, cloneType) {
    if (clone.id) {
      clone.id = `${clone.id}-${cloneType}-clone`;
    }
    
    const childrenWithIds = clone.querySelectorAll('[id]');
    childrenWithIds.forEach(child => {
      if (child.id) {
        child.id = `${child.id}-${cloneType}-clone`;
      }
    });
  }

  /**
   * Apply color palette to a cloned element with error handling
   * @param {HTMLElement} clone - The cloned element
   */
  _applyPaletteToClone(clone) {
    try {
      applyPaletteToElement(clone);
    } catch (error) {
      console.warn('Failed to apply palette to infinite scroll clone:', error);
    }
  }

  /**
   * Apply flexbox styles to an item
   * @param {HTMLElement} item - The item to style
   */
  _applyFlexboxStyles(item) {
    const flexStyles = {
      position: 'relative',
      width: '100%',
      height: 'auto',
      flexShrink: '0'
    };
    this._applyStyles(item, flexStyles);
  }

  /**
   * Add tracking attributes to an item
   * @param {HTMLElement} item - The item to add attributes to
   * @param {number} index - The item's index
   * @param {string} type - The item type
   */
  _addTrackingAttributes(item, index, type) {
    item.dataset.infiniteScrollType = type;
    item.dataset.infiniteScrollIndex = index.toString();
  }

  /**
   * Calculate total height of a collection of elements
   * @param {Array} collection - Collection of DOM elements
   * @returns {number} Total height
   */
  _calculateCollectionHeight(collection) {
    if (collection.length === 0) return 0;
    
    // Use estimated height for performance if many items
    if (collection.length > 10) {
      return collection.length * INFINITE_SCROLL_CONFIG.DEFAULT_ITEM_HEIGHT;
    }
    
    return collection.reduce((total, item) => {
      return total + (item?.offsetHeight || INFINITE_SCROLL_CONFIG.DEFAULT_ITEM_HEIGHT);
    }, 0);
  }

  /**
   * Calculate metrics needed for repositioning
   * @returns {Object} Repositioning metrics
   */
  _calculateRepositionMetrics() {
    return {
      headHeight: this.calculateHeadClonesHeight(),
      originalHeight: this.calculateOriginalContentHeight(),
      tailHeight: this.calculateTailClonesHeight()
    };
  }

  /**
   * Set repositioning state and prevent multiple simultaneous repositions
   * @param {boolean} isRepositioning - Whether repositioning is active
   */
  _setRepositioning(isRepositioning) {
    this.isRepositioning = isRepositioning;
  }

  /**
   * Schedule reset of repositioning flag
   */
  _scheduleRepositioningReset() {
    setTimeout(() => {
      this.isRepositioning = false;
    }, INFINITE_SCROLL_CONFIG.REPOSITION_DELAY);
  }

  /**
   * Wrap index to valid range for infinite scrolling
   * @param {number} index - Index to wrap
   * @returns {number} Wrapped index
   */
  _wrapIndex(index) {
    if (!this.originalItems || this.originalItems.length === 0) {
      console.warn(`[InfiniteScrollingContainer] Cannot wrap index - no items available`);
      return -1; // Return invalid index to signal no items
    }
    
    if (index < 0 || index >= this.originalItems.length) {
      console.warn(`[DEBUG] scrollToIndex: Invalid index ${index} - using modulo to wrap around`);
      return ((index % this.originalItems.length) + this.originalItems.length) % this.originalItems.length;
    }
    
    return index;
  }

  /**
   * Notify listeners of item change
   * @param {number} index - New active index
   * @param {HTMLElement} item - New active item
   */
  _notifyItemChange(index, item) {
    if (this.options.onItemChange) {
      try {
        this.options.onItemChange(index, item);
      } catch (error) {
        console.error('[InfiniteScrollingContainer] Error in onItemChange callback:', error);
      }
    }
  }

  // ==================== STATIC METHODS ====================

  static reset() {
    if (InfiniteScrollingContainer.instance) {
      InfiniteScrollingContainer.instance.destroy();
      InfiniteScrollingContainer.instance = null;
    }
  }
}

export { InfiniteScrollingContainer };