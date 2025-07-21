import { AppState } from '@/modules/core/stateManager.mjs';
import { selectionManager } from '@/modules/core/selectionManager.mjs';

/**
 * A robust infinite/virtual scrolling container that handles dynamic item heights
 * and maintains the selected item's visibility during resizes.
 */
export class InfiniteScrollingContainer {
    constructor(scrollport, contentHolder) {
        this.scrollport = scrollport;
        this.contentHolder = contentHolder;
        this.allItems = [];
        this.resizeTimeoutId = null;

        this.scrollport.style.position = 'relative';
        this.scrollport.style.overflowY = 'auto';
        this.contentHolder.style.position = 'relative';

        // Debounced resize handler
        const resizeObserver = new ResizeObserver(() => this.handleResize());
        resizeObserver.observe(this.scrollport);
    }

    /**
     * Sets the items to be displayed in the scroller.
     * @param {HTMLElement[]} items - An array of DOM elements.
     */
    setItems(items) {
        this.contentHolder.innerHTML = '';
        this.allItems = items.map((element, index) => {
            this.contentHolder.appendChild(element);
            return {
                element,
                originalIndex: index,
                height: 0,
                top: 0,
            };
        });
        this.calculateItemPositions(true); // Initial calculation
    }

    /**
     * Measures the true rendered height of a single item using getBoundingClientRect.
     * This is the most accurate method as it includes content, padding, and borders.
     * @param {object} item - The item object containing the element.
     * @param {boolean} force - Whether to force a remeasurement.
     * @returns {number} The measured height of the element.
     */
    measureItemHeight(item, force) {
        if (force || !item.height) {
            const element = item.element;
            // Ensure height is auto so the browser can calculate its natural height
            element.style.height = 'auto';
            // Force a reflow to get the most up-to-date dimensions
            void element.offsetHeight;
            const height = element.getBoundingClientRect().height;
            item.height = height;
            return height;
        }
        return item.height;
    }

    /**
     * Gets the margin-top value from the application's state.
     * @returns {number} The margin-top value in pixels.
     */
    getRDivMarginTop() {
        try {
            const marginTopStr = AppState.theme?.rDivBorderOverrideSettings?.normal?.marginTop || '0px';
            return parseInt(marginTopStr, 10) || 0;
        } catch (e) {
            return 5; // Fallback
        }
    }

    /**
     * Calculates and applies the absolute positions for all items in the scroller.
     * @param {boolean} forceRecalculation - Whether to force remeasurement of all items.
     * @returns {number} The total height of the content.
     */
    calculateItemPositions(forceRecalculation = false) {
        let currentTop = 0;
        const itemSpacing = this.getRDivMarginTop();

        for (const item of this.allItems) {
            const height = this.measureItemHeight(item, forceRecalculation);

            // Set the item's top position
            item.top = currentTop;

            // Apply the absolute positioning via styles
            const { style } = item.element;
            style.position = 'absolute';
            style.top = `${item.top}px`;
            style.left = '0';
            style.right = '0';
            style.width = '100%';
            style.height = `${height}px`;

            // Update the running total for the next item's position
            currentTop += height + itemSpacing;
        }

        // Set the total height of the content holder to enable the scrollbar
        this.contentHolder.style.height = `${currentTop}px`;
        return currentTop;
    }

    /**
     * Handles window or panel resize events with debouncing.
     * This is the core of the fix.
     */
    handleResize() {
        if (this.resizeTimeoutId) {
            clearTimeout(this.resizeTimeoutId);
        }

        this.resizeTimeoutId = setTimeout(() => {
            window.CONSOLE_LOG_IGNORE('[InfiniteScroller] Resize detected. Recalculating layout...');

            // Get the currently selected job number BEFORE recalculating layout
            const selectedJobNumber = selectionManager.getSelectedJobNumber();

            // 1. Recalculate all item positions because their heights have changed.
            this.calculateItemPositions(true); // forceRecalculation = true

            // 2. If an item was selected, scroll it back into view.
            if (selectedJobNumber !== null) {
                window.CONSOLE_LOG_IGNORE(`[InfiniteScroller] Restoring view to selected job: ${selectedJobNumber}`);
                this.scrollToJobNumber(selectedJobNumber, 'handleResize');
            }

            this.resizeTimeoutId = null;
        }, AppState.constants.performance.debounceTimeout || 150);
    }

    /**
     * Scrolls the container to make the specified job number visible.
     * Ensures the header of the item is visible.
     * @param {number} jobNumber - The job number to scroll to.
     * @param {string} caller - The calling function for debugging.
     */
    scrollToJobNumber(jobNumber, caller = '') {
        if (this.allItems.length === 0) {
            console.warn(`[InfiniteScroller] Cannot scroll to job ${jobNumber}, no items loaded.`);
            return;
        }

        const targetItem = this.allItems.find(item =>
            item.element && parseInt(item.element.getAttribute('data-job-number')) === jobNumber
        );

        if (!targetItem) {
            console.warn(`[InfiniteScroller] Could not find item for job number ${jobNumber} from caller: ${caller}`);
            return;
        }

        // --- Calculate Header Height ---
        // Find the header element to ensure it's visible after scrolling.
        const headerElement = targetItem.element.querySelector('.biz-details-employer, .biz-details-role, .biz-details-dates');
        const headerHeight = headerElement ? headerElement.offsetHeight : 0;
        const headerAndMargin = headerHeight + 20; // Add some margin

        // --- Check if Already Visible ---
        const viewportTop = this.scrollport.scrollTop;
        const viewportHeight = this.scrollport.offsetHeight;
        const itemTop = targetItem.top;
        const itemHeight = targetItem.height;

        // Check if the item's header is already comfortably in view
        const isHeaderVisible = itemTop >= viewportTop && (itemTop + headerAndMargin) <= (viewportTop + viewportHeight);

        if (isHeaderVisible) {
            
            return;
        }

        // --- Calculate Target Scroll Position ---
        // Aim to place the item's top edge near the top of the viewport, with a margin.
        const targetScrollTop = Math.max(0, itemTop - 50); // 50px margin from top

        

        this.scrollport.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
    }

    /**
     * Finds an item by its job number.
     * @param {number} jobNumber
     * @returns {object|null} The item object or null if not found.
     */
    getItemByJobNumber(jobNumber) {
        return this.allItems.find(item =>
            item.element && parseInt(item.element.getAttribute('data-job-number')) === jobNumber
        ) || null;
    }

    /**
     * Destroys the instance and cleans up event listeners.
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.resizeTimeoutId) {
            clearTimeout(this.resizeTimeoutId);
        }
        this.contentHolder.innerHTML = '';
        this.allItems = [];
    }
}