// modules/resume/resumeListScrollContainer.mjs
// Resume list scroll container with seamless wrapping via head/tail clones
//
// Single ordered list (contentHolder): [ head clones | original items | tail clones | footer items (e.g. skill cards) ].
// Pre/post caching: head = copies of last N originals at top; tail = copies of first N originals at bottom.
// Footer items are appended to the same list and preserved across setItems() rebuilds; they are not cloned.

import { applyPaletteToElement } from '../composables/useColorPalette.mjs';
import { selectionManager } from '../core/selectionManager.mjs';

/**
 * Configuration for resume list scroll (wrapping) behavior
 */
const RESUME_LIST_SCROLL_CONFIG = {
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
    overflowX: 'visible', // bizCardLineItems (rDivs) must never be clipped by their container
    backgroundColor: 'var(--grey-dark-6)'
  },
  contentHolder: {
    backgroundColor: 'var(--grey-dark-6)',
    position: 'relative',
    width: '100%',
    height: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px' /* Flex container controls spacing between rDivs */
  }
};

/**
 * ResumeListScrollContainer - Resume list with seamless wrapping via head/tail clones
 */
class ResumeListScrollContainer {
  /**
   * Create a resume list scroll container
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
    this._footerItems = []; // Appended skill cards etc. – preserved across rebuilds, always after tail clones
    this.currentIndex = 0;
    this._isInitialized = false;
    this.isRepositioning = false;

    this.init();
  }

  /**
   * Initialize the scroll container
   */
  init() {
    try {
      this.setupContainer();
      this.setupScrollListener();
      console.debug('[ResumeListScrollContainer] initialized');
    } catch (error) {
      console.error('[ResumeListScrollContainer] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up container styling and layout
   */
  setupContainer() {
    console.debug('[ResumeListScrollContainer] setupContainer');

    this.scrollport.classList?.add('resume-list-scroll-container');
    this._applyStyles(this.scrollport, CONTAINER_STYLES.scrollport);
    this._applyStyles(this.contentHolder, CONTAINER_STYLES.contentHolder);

    this._listIndicesObserver = new MutationObserver(() => this._updateResumeListIndices());
    this._listIndicesObserver.observe(this.contentHolder, { childList: true });
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
   * Set the items for the resume list
   * @param {Array} items - Array of DOM elements to display
   * @param {number} startingIndex - Initial index to display (default: 0)
   */
  setItems(items, startingIndex = 0) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    console.debug('[ResumeListScrollContainer] setItems', items.length);

    this._resetState();
    this.originalItems = [...items];

    if (items.length === 0) {
      console.warn('[ResumeListScrollContainer] No items provided');
      return;
    }

    this._buildScrollStructure();
    this._isInitialized = true;
  }

  createHeadClones() {
    const cloneCount = Math.min(RESUME_LIST_SCROLL_CONFIG.CLONE_COUNT, this.originalItems.length);
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

  createTailClones() {
    const cloneCount = Math.min(RESUME_LIST_SCROLL_CONFIG.CLONE_COUNT, this.originalItems.length);
    const sourceItems = this.originalItems.slice(0, cloneCount);

    sourceItems.forEach((sourceItem, index) => {
      if (sourceItem) {
        const clone = this._createClone(sourceItem, 'tail', index);
        this.tailClones.push(clone);
        this.contentHolder.appendChild(clone);
      }
    });
  }

  _createClone(sourceItem, cloneType, originalIndex) {
    const clone = sourceItem.cloneNode(true);
    this._attachRDivCloseHandler(clone);
    this._attachRDivClickHandler(clone);

    this._markAsClone(clone, cloneType, originalIndex);
    this._updateCloneIds(clone, cloneType);
    this.prepareItemForScroll(clone, originalIndex, cloneType);
    this._applyPaletteToClone(clone);

    return clone;
  }

  _attachRDivCloseHandler(rDivOrClone) {
    const closeBtn = rDivOrClone.querySelector?.('.r-div-close');
    const jobNumberStr = rDivOrClone.getAttribute?.('data-job-number');
    if (!closeBtn || jobNumberStr == null || jobNumberStr === '') return;
    const jobNumber = parseInt(jobNumberStr, 10);
    if (Number.isNaN(jobNumber)) return;
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const controller = window.resumeFlock?.resumeItemsController;
      if (controller && typeof controller.removeRDivFromListing === 'function') {
        controller.removeRDivFromListing(jobNumber);
      }
    });
  }

  _attachRDivClickHandler(rDivOrClone) {
    if (!rDivOrClone.classList?.contains('biz-resume-div')) return;
    const jobNumberStr = rDivOrClone.getAttribute?.('data-job-number');
    if (jobNumberStr == null || jobNumberStr === '') return;
    const jobNumber = parseInt(jobNumberStr, 10);
    if (Number.isNaN(jobNumber)) return;
    rDivOrClone.addEventListener('click', (e) => {
      if (e.target.closest('.r-div-close')) return;
      const sm = selectionManager;
      const isSelected = sm.getSelectedJobNumber() === jobNumber;
      if (isSelected) {
        sm.clearSelection('ResumeListScrollContainer.rDivCloneClick');
      } else {
        sm.selectJobNumber(jobNumber, 'ResumeListScrollContainer.rDivCloneClick');
        const controller = window.resumeFlock?.resumeItemsController;
        if (controller && typeof controller._scrollRDivIntoView === 'function') {
          controller._scrollRDivIntoView(rDivOrClone, jobNumber);
        }
      }
    });
  }

  /**
   * Prepare an item for layout (positioning and tracking)
   */
  prepareItemForScroll(item, index, type) {
    this._clearPositioningStyles(item);
    this._applyFlexboxStyles(item);
    this._addTrackingAttributes(item, index, type);
  }

  _clearPositioningStyles(element) {
    const propertiesToRemove = ['position', 'top', 'left', 'height', 'width', 'transform'];
    propertiesToRemove.forEach(prop => element.style.removeProperty(prop));
  }

  checkScrollBoundaries() {
    const { scrollTop, scrollHeight, clientHeight } = this.scrollport;
    const buffer = RESUME_LIST_SCROLL_CONFIG.SCROLL_BUFFER;
    const metrics = this._calculateRepositionMetrics();
    const endOfTail = metrics.headHeight + metrics.originalHeight + metrics.tailHeight;

    if (scrollTop < buffer) {
      console.debug('[ResumeListScrollContainer] near top boundary');
      this._repositionToBottom();
    } else if (scrollTop + clientHeight > scrollHeight - buffer && scrollTop < endOfTail) {
      console.debug('[ResumeListScrollContainer] near bottom boundary');
      this._repositionToTop();
    }
  }

  _repositionToBottom() {
    if (this.isRepositioning) return;
    this._setRepositioning(true);

    const metrics = this._calculateRepositionMetrics();
    const currentScrollInOriginals = this.scrollport.scrollTop - metrics.headHeight;
    const newScrollTop = metrics.headHeight + metrics.originalHeight + currentScrollInOriginals;

    this.scrollport.scrollTop = newScrollTop;
    console.log(`[ResumeListScrollContainer] Repositioned from top area to bottom: ${newScrollTop}px`);

    this._scheduleRepositioningReset();
  }

  _repositionToTop() {
    if (this.isRepositioning) return;
    this._setRepositioning(true);

    const metrics = this._calculateRepositionMetrics();
    const currentScrollInTailClones = this.scrollport.scrollTop - metrics.headHeight - metrics.originalHeight;
    const newScrollTop = metrics.headHeight + currentScrollInTailClones;

    this.scrollport.scrollTop = newScrollTop;
    console.debug('[ResumeListScrollContainer] repositioned bottom→top');

    this._scheduleRepositioningReset();
  }

  calculateHeadClonesHeight() {
    return this._calculateCollectionHeight(this.headClones);
  }

  calculateOriginalContentHeight() {
    return this._calculateCollectionHeight(this.originalItems);
  }

  calculateTailClonesHeight() {
    return this._calculateCollectionHeight(this.tailClones);
  }

  scrollToIndex(originalIndex, animate = true) {
    console.debug('[ResumeListScrollContainer] scrollToIndex', originalIndex);

    if (!this.originalItems || this.originalItems.length === 0) {
      console.debug(`[ResumeListScrollContainer] Cannot scroll - no items available (originalItems length: ${this.originalItems?.length || 0})`);
      return;
    }

    const wrappedIndex = this._wrapIndex(originalIndex);

    if (wrappedIndex === -1) {
      console.warn(`[ResumeListScrollContainer] Cannot scroll - invalid wrapped index`);
      return;
    }

    const targetItem = this.originalItems[wrappedIndex];

    if (targetItem) {
      targetItem.scrollIntoView({
        behavior: animate ? 'smooth' : 'auto',
        block: 'start'
      });

      this.currentIndex = wrappedIndex;
      this._notifyItemChange(wrappedIndex, targetItem);
    } else {
      console.warn(`[ResumeListScrollContainer] No item found at index ${wrappedIndex} (total items: ${this.originalItems.length})`);
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
    console.debug('[ResumeListScrollContainer] recalculateHeights no-op');
  }

  recalculateHeightsAfterPalette() {
    console.debug('[ResumeListScrollContainer] recalculateHeightsAfterPalette no-op');
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

  getCurrentlyVisibleJob() {
    const currentItem = this.getCurrentItem();
    if (currentItem) {
      const jobNumber = parseInt(currentItem.getAttribute('data-job-number'), 10);
      return isNaN(jobNumber) ? null : jobNumber;
    }
    return null;
  }

  goToNext() {
    const nextIndex = this.currentIndex + 1;
    this.scrollToIndex(nextIndex);
  }

  goToPrevious() {
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
    this.originalItems = [];
    this.headClones = [];
    this.tailClones = [];
    this.currentIndex = 0;
    this._isInitialized = false;
    this.isRepositioning = false;
  }

  _validateConstructorParams(scrollportElement, contentElement) {
    if (!scrollportElement || !(scrollportElement instanceof HTMLElement)) {
      throw new Error('Scrollport element must be a valid HTMLElement');
    }
    if (!contentElement || !(contentElement instanceof HTMLElement)) {
      throw new Error('Content element must be a valid HTMLElement');
    }
  }

  _applyStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
      element.style[property] = value;
    });
  }

  _resetState() {
    const footerNodes = this.contentHolder.querySelectorAll('.appended-skill-resume-div');
    const seenSkillCardIds = new Set();
    this._footerItems = [];
    footerNodes.forEach((el) => {
      const id = el.getAttribute('data-skill-card-id') ?? '';
      if (seenSkillCardIds.has(id)) return;
      seenSkillCardIds.add(id);
      this._footerItems.push(el);
    });
    this._footerItems.forEach((el) => el.remove());
    this.contentHolder.innerHTML = '';
    this.headClones = [];
    this.tailClones = [];
    this.currentIndex = 0;
    this.isRepositioning = false;
  }

  _buildScrollStructure() {
    this.createHeadClones();
    this._addOriginalItems();
    this.createTailClones();
    this._appendFooterItems();
    this._updateResumeListIndices();
    console.debug('[ResumeListScrollContainer] structure created', this.originalItems.length, 'footer items:', this._footerItems.length);
  }

  _updateResumeListIndices() {
    if (!this.contentHolder) return;
    const total = this.contentHolder.children.length;
    Array.from(this.contentHolder.children).forEach((el, i) => {
      const span = el.querySelector('.biz-details-list-index');
      if (span) span.textContent = `${i} / ${total}`;
    });
  }

  _appendFooterItems() {
    this._footerItems.forEach(node => {
      if (node && node.parentNode !== this.contentHolder) {
        this.contentHolder.appendChild(node);
      }
    });
  }

  clearFooterItems() {
    this._footerItems.forEach((el) => { if (el && el.parentNode) el.remove(); });
    this._footerItems = [];
  }

  appendFooterItem(node) {
    if (!node) return;
    const skillCardId = node.getAttribute?.('data-skill-card-id') ?? '';
    const existing = this._footerItems.find((el) => el.getAttribute?.('data-skill-card-id') === skillCardId);
    if (existing && existing !== node) {
      existing.remove();
      this._footerItems = this._footerItems.filter((el) => el !== existing);
    }
    if (this.contentHolder !== node.parentNode) {
      this.contentHolder.appendChild(node);
    }
    if (!this._footerItems.includes(node)) {
      this._footerItems.push(node);
    }
    this._updateResumeListIndices();
  }

  _addOriginalItems() {
    this.originalItems.forEach((item, index) => {
      if (item) {
        this.prepareItemForScroll(item, index, 'original');
        this.contentHolder.appendChild(item);
      }
    });
  }

  _markAsClone(clone, cloneType, originalIndex) {
    clone.classList.add('resume-list-clone', `${cloneType}-clone`);
    clone.dataset.originalIndex = originalIndex.toString();
    clone.dataset.cloneType = cloneType;
  }

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

  _applyPaletteToClone(clone) {
    try {
      applyPaletteToElement(clone);
    } catch (error) {
      console.error('Failed to apply palette to resume list clone:', error);
      throw error;
    }
  }

  _applyFlexboxStyles(item) {
    const flexStyles = {
      position: 'relative',
      width: '100%',
      height: 'auto',
      flexShrink: '0'
    };
    this._applyStyles(item, flexStyles);
  }

  _addTrackingAttributes(item, index, type) {
    item.dataset.scrollItemType = type;
    item.dataset.scrollItemIndex = index.toString();
  }

  _calculateCollectionHeight(collection) {
    if (collection.length === 0) return 0;

    if (collection.length > 10) {
      return collection.length * RESUME_LIST_SCROLL_CONFIG.DEFAULT_ITEM_HEIGHT;
    }

    return collection.reduce((total, item) => {
      return total + (item?.offsetHeight || RESUME_LIST_SCROLL_CONFIG.DEFAULT_ITEM_HEIGHT);
    }, 0);
  }

  _calculateRepositionMetrics() {
    return {
      headHeight: this.calculateHeadClonesHeight(),
      originalHeight: this.calculateOriginalContentHeight(),
      tailHeight: this.calculateTailClonesHeight()
    };
  }

  _setRepositioning(isRepositioning) {
    this.isRepositioning = isRepositioning;
  }

  _scheduleRepositioningReset() {
    setTimeout(() => {
      this.isRepositioning = false;
    }, RESUME_LIST_SCROLL_CONFIG.REPOSITION_DELAY);
  }

  _wrapIndex(index) {
    if (!this.originalItems || this.originalItems.length === 0) {
      console.warn(`[ResumeListScrollContainer] Cannot wrap index - no items available`);
      return -1;
    }

    if (index < 0 || index >= this.originalItems.length) {
      console.warn(`[DEBUG] scrollToIndex: Invalid index ${index} - using modulo to wrap around`);
      return ((index % this.originalItems.length) + this.originalItems.length) % this.originalItems.length;
    }

    return index;
  }

  _notifyItemChange(index, item) {
    if (this.options.onItemChange) {
      try {
        this.options.onItemChange(index, item);
      } catch (error) {
        console.error('[ResumeListScrollContainer] Error in onItemChange callback:', error);
        throw error;
      }
    }
  }

  static reset() {
    if (ResumeListScrollContainer.instance) {
      ResumeListScrollContainer.instance.destroy();
      ResumeListScrollContainer.instance = null;
    }
  }
}

export { ResumeListScrollContainer };
