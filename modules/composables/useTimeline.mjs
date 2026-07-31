import { ref, computed } from 'vue';
import * as dateUtils from '@/modules/utils/dateUtils.mjs';
import { linearInterp } from '@/modules/utils/mathUtils.mjs';

// --- Constants ---
const YEAR_HEIGHT = 200; // The height in pixels for one year on the timeline
const TIMELINE_PADDING_TOP = 0; // No top padding - scene plane will handle alignment
/** Used when a resume has no parseable job dates (e.g. redacted "9/XX"). */
const FALLBACK_YEAR_SPAN = 5;

// --- Reactive State (Singleton) ---
const isInitialized = ref(false);
const startYear = ref(0);
const endYear = ref(0);
const timelineHeight = ref(0);

function dateToFractionalYear(date) {
    return date.getFullYear() + date.getMonth() / 12 + date.getDate() / 365.25 / 12;
}

function heightFromSpan(start, end) {
    const totalYearSpan = end - start;
    // Add 50px padding at top for year labels (used in linearInterp)
    return totalYearSpan * YEAR_HEIGHT + TIMELINE_PADDING_TOP + 50;
}

/**
 * Collect the earliest start and latest end among parseable job dates.
 * CURRENT_DATE / blank end / "present" count as today for the max.
 * @param {Array} jobsData
 * @returns {{ earliestStart: Date|null, latestEnd: Date|null, hasOpenEnded: boolean }}
 */
function collectJobDateExtents(jobsData) {
    let earliestStart = null;
    let latestEnd = null;
    let hasOpenEnded = false;
    const today = new Date();

    for (const job of jobsData) {
        const startDate = dateUtils.tryParseFlexibleDateString(job.start || job.startDate);
        if (startDate && (!earliestStart || startDate < earliestStart)) {
            earliestStart = startDate;
        }

        const endStr = job.end || job.endDate;
        const endIsOpen =
            !endStr ||
            endStr === 'CURRENT_DATE' ||
            (typeof endStr === 'string' &&
                (endStr.toLowerCase().includes('present') || endStr.toLowerCase().includes('current')));
        if (endIsOpen) {
            hasOpenEnded = true;
            if (!latestEnd || today > latestEnd) latestEnd = today;
            continue;
        }
        const endDate = dateUtils.tryParseFlexibleDateString(endStr);
        if (endDate && (!latestEnd || endDate > latestEnd)) {
            latestEnd = endDate;
        }
    }

    return { earliestStart, latestEnd, hasOpenEnded };
}

/**
 * Compute timeline fractional-year bounds and pixel height from resume jobs.
 * Always returns bounds so Timeline dimensions can be driven on every resume load.
 *
 * @param {Array} jobsData - Enriched jobs array
 * @returns {{ start: number, end: number, height: number, source: 'jobs'|'fallback' }}
 */
export function computeBoundsFromJobs(jobsData) {
    const now = new Date();
    const nowFrac = dateToFractionalYear(now);

    if (!jobsData || !Array.isArray(jobsData) || jobsData.length === 0) {
        const end = nowFrac;
        const start = end - FALLBACK_YEAR_SPAN;
        return { start, end, height: heightFromSpan(start, end), source: 'fallback' };
    }

    const { earliestStart, latestEnd } = collectJobDateExtents(jobsData);

    if (!earliestStart && !latestEnd) {
        const end = nowFrac;
        const start = end - FALLBACK_YEAR_SPAN;
        return { start, end, height: heightFromSpan(start, end), source: 'fallback' };
    }

    // Match prior padding: start = earliest − 1y + 6mo; end = reference + 1y − 12mo
    const rawStart = earliestStart
        ? new Date(earliestStart)
        : new Date(latestEnd.getFullYear() - FALLBACK_YEAR_SPAN, latestEnd.getMonth(), latestEnd.getDate());
    if (earliestStart) {
        rawStart.setFullYear(rawStart.getFullYear() - 1);
        rawStart.setMonth(rawStart.getMonth() + 6);
    }

    const referenceEnd = latestEnd || now;
    const rawEnd = new Date(referenceEnd);
    rawEnd.setFullYear(rawEnd.getFullYear() + 1);
    rawEnd.setMonth(rawEnd.getMonth() - 12);

    let start = dateToFractionalYear(rawStart);
    let end = dateToFractionalYear(rawEnd);

    // Guarantee a positive span (degenerate or inverted after padding)
    if (!(end > start)) {
        end = start + FALLBACK_YEAR_SPAN;
    }

    return { start, end, height: heightFromSpan(start, end), source: 'jobs' };
}

function applyBounds(bounds) {
    startYear.value = bounds.start;
    endYear.value = bounds.end;
    timelineHeight.value = bounds.height;
    isInitialized.value = true;
}

/**
 * Recompute timeline min/max (and height) from the loaded resume's jobs.
 * Always updates — call on every resume load so Timeline dimensions match content.
 * @param {Array} jobsData - Enriched jobs array
 */
function reinitialize(jobsData) {
    const bounds = computeBoundsFromJobs(jobsData);
    applyBounds(bounds);
    const label = bounds.source === 'fallback'
        ? 'fallback window (no parseable job dates)'
        : `${bounds.start.toFixed(2)} → ${bounds.end.toFixed(2)}`;
    console.log(`[useTimeline] Timeline bounds from resume load (${bounds.source}): ${label}; height=${Math.round(bounds.height)}px`);
}

/**
 * Grow the timeline (and scene plane via --timeline-height) so it reaches at least
 * `contentBottomPx` (bottom edge of the bottom-most scene card), keeping ~YEAR_HEIGHT
 * density by extending the older startYear bound.
 * @param {number} contentBottomPx
 * @param {{ padding?: number }} [opts]
 */
function extendToCoverSceneBottom(contentBottomPx, { padding = 40 } = {}) {
    if (!isInitialized.value) return;
    const needed = Math.ceil(Number(contentBottomPx) || 0) + padding;
    if (!(needed > timelineHeight.value)) return;

    const end = endYear.value;
    const newSpan = Math.max(FALLBACK_YEAR_SPAN, (needed - (TIMELINE_PADDING_TOP + 50)) / YEAR_HEIGHT);
    startYear.value = end - newSpan;
    timelineHeight.value = needed;
    console.log(`[useTimeline] Extended timeline to cover scene cards: height=${needed}px (startYear=${startYear.value.toFixed(2)})`);
}

/**
 * First-time init; same as reinitialize (bounds always recomputed from jobs).
 * @param {Array} jobsData
 */
function initialize(jobsData) {
    if (!jobsData) {
        window.CONSOLE_LOG_IGNORE('Timeline initialization failed: jobsData not provided.');
        return;
    }
    reinitialize(jobsData);
}

// --- Composable ---
function useTimeline() {
    const years = computed(() => {
        if (!isInitialized.value) return [];
        const yearArray = [];
        // Display years to fill the entire calculated timeline height
        // Use floor/ceil to ensure we cover the full fractional range
        const displayStartYear = Math.floor(startYear.value);
        const displayEndYear = Math.ceil(endYear.value);

        for (let year = displayEndYear; year >= displayStartYear; year--) {
            // January 1st fractional year is just the integer year (year + 0)
            const yearPos = linearInterp(year, startYear.value, timelineHeight.value, endYear.value, TIMELINE_PADDING_TOP + 50);

            yearArray.push({
                year: year, // Clean integer year for display
                y: yearPos
            });
        }
        return yearArray;
    });

    function getPositionForDate(date) {
        if (!isInitialized.value) {
            window.CONSOLE_LOG_IGNORE('getPositionForDate called before timeline was initialized.');
            return 0;
        }
        if (!date) return 0;

        // Convert date to fractional year for precise interpolation
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        const day = date.getDate();
        const yearFraction = month / 12 + day / 365.25 / 12;
        const dateAsYear = year + yearFraction;

        // Based on measurements: 2026-01-01 -> 137px, position 0 -> 2026 + (137/200) years
        const referenceDateYear = 2026 + (137 / 200); // 2026.685 years
        const referencePosition = 0; // position 0

        // Use simple linear scaling: 200px per year
        const yPosition = referencePosition + (referenceDateYear - dateAsYear) * 200;

        return yPosition;
    }

    function getDateForPosition(yPosition) {
        if (!isInitialized.value) {
            window.CONSOLE_LOG_IGNORE('getDateForPosition called before timeline was initialized.');
            return null;
        }

        // Based on measurements: position 0 -> 2026 + (137/200) years
        const referenceDateYear = 2026 + (137 / 200); // 2026.685 years
        const referencePosition = 0; // position 0

        // Use simple linear scaling: 200px per year (reverse)
        const dateAsYear = referenceDateYear - (yPosition - referencePosition) / 200;

        // Convert fractional year back to date
        const year = Math.floor(dateAsYear);
        const yearRemainder = dateAsYear - year;
        const month = Math.floor(yearRemainder * 12);
        const monthRemainder = (yearRemainder * 12) - month;
        const day = Math.floor(monthRemainder * 365.25 / 12) + 1;

        return new Date(Date.UTC(year, month, day));
    }

    return {
        isInitialized: computed(() => isInitialized.value),
        startYear: computed(() => startYear.value),
        endYear: computed(() => endYear.value),
        timelineHeight: computed(() => timelineHeight.value),
        years,
        getPositionForDate,
        getDateForPosition,
        reinitialize,
        extendToCoverSceneBottom,
    };
}

export { initialize, useTimeline, YEAR_HEIGHT, FALLBACK_YEAR_SPAN };
