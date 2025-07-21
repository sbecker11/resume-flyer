// scene/bizDetailsDivModule.mjs

// BizDetailsDiv is the div that contains the details of the job
// and will be added to the bizCard and will be added to the
// BizResumeDiv which will be added to the resume-content-div.
// BizDetailsDivs do not add themselves to a bizCardDiv or 
// a bizResumeDiv.

import * as utils from '../utils/utils.mjs';
import { formatDateRange } from '../utils/dateUtils.mjs';
import { BULLET } from '../constants/ui.mjs';
import { jobs as jobsData, getValidatedJobNumber } from '../../static_content/jobs/jobs.mjs';
import { 
    createBizCardDivId,
    createBizResumeDivId, 
    createBizResumeDetailsDivId,
    createBizResumeDetailsDivClass,
    createBizCardDetailsDivId,
    createBizCardDetailsDivClass
} from '../scene/CardsController.mjs';


/**
 * Creates a business resume details div
 * @param {HTMLElement} bizResumeDiv - The business resume div (in progress)
 * @param {HTMLElement} bizCardDiv - The business card div (in progress)
 * @returns {HTMLElement} The created business resume details div
 */
export function createBizResumeDetailsDiv(bizResumeDiv, bizCardDiv) {
    if (!bizResumeDiv) throw new Error('createBizResumeDetailsDiv: bizResumeDiv is null');
    if (!bizCardDiv) throw new Error('createBizResumeDetailsDiv: bizCardDiv is null');
    
    const jobNumber = getValidatedJobNumber(bizResumeDiv);
    
    const bizResumeDivColorIndex = bizResumeDiv.getAttribute('data-color-index');
    if (!utils.isNumericString(bizResumeDivColorIndex)) throw new Error('createBizResumeDetailsDiv: non-numeric bizResumeDivColorIndex string');
    const bizCardDivColorIndex = bizCardDiv.getAttribute('data-color-index');
    if (!utils.isNumericString(bizCardDivColorIndex)) throw new Error('createBizResumeDetailsDiv: non-numeric bizCardDivColorIndex string');
    if ( bizResumeDivColorIndex != bizCardDivColorIndex ) throw new Error('createBizResumeDetailsDiv: bizResumeDivColorIndex != bizCardDivColorIndex');

    const bizResumeDetailsDiv = document.createElement('div');
    bizResumeDetailsDiv.id = createBizResumeDetailsDivId(jobNumber);
    bizResumeDetailsDiv.classList.add(createBizResumeDetailsDivClass());

    // Set pointer-events to none so clicks pass through to the parent bizResumeDiv
    bizResumeDetailsDiv.style.pointerEvents = 'none';
    bizResumeDetailsDiv.style.backgroundColor = 'transparent';

    const bizCardDetailsDiv = document.getElementById(createBizCardDetailsDivId(jobNumber));
    if (!bizCardDetailsDiv) throw new Error('createBizResumeDetailsDiv: bizCardDetailsDiv not found');

    // copy the innerHTML of the bizCardDetailsDiv header element innerHTML 
    bizResumeDetailsDiv.innerHTML = bizCardDetailsDiv.innerHTML;

    // Remove the original Z-value element from the resume div clone
    const zValueElement = bizResumeDetailsDiv.querySelector('.biz-details-z-value');
    if (zValueElement) zValueElement.remove();
    
    // place the subContextStr for the bizResumeDiv to the end of the bizResumeDetailsDiv
    const bizResumeSubContextElement = document.createElement('p');
    bizResumeSubContextElement.innerHTML = createBizCardDetailsDiv(bizCardDiv);
    bizResumeDetailsDiv.insertAdjacentHTML('beforeend', bizResumeSubContextElement.innerHTML);
    
    return bizResumeDetailsDiv;
}

/**
 * If the bizCardDiv is a clone, then return the bizCardDiv.
 * If the bizCardDiv has a clone, then return the bizCardDivClone,
 * otherwise return null
 * @param {HTMLElement} bizCardDiv 
 * @returns {HTMLElement} the bizCardDivClone or null if not found
 */
export function getBizCardDivClone(bizCardDiv) {
    if ( bizCardDiv == null ) {
        throw new Error('getBizCardDivClone: bizCardDiv is null');
    }
    // bizCardDiv is a clone
    if ( bizCardDiv.id.indexOf('clone') != -1 ) {
        return bizCardDiv;
    }
    const bizCardDivClone = bizCardDiv.querySelector('.biz-card-div-clone');
    if ( bizCardDivClone == null ) {
        return null;
    }
    return bizCardDivClone;
}

/**
 * If the bizCardDiv is not a clone return it
 * if it is a clone then find and return the original bizCardDiv
 * @param {HTMLElement} bizCardDiv 
 * @returns {HTMLElement} the bizCardDivClone or null if not found
 */
export function getOriginalBizCardDiv(bizCardDiv) {
    if ( bizCardDiv == null ) {
        return null;
    }
    
    try {
        const jobNumber = getValidatedJobNumber(bizCardDiv);
        const originalBizCardDivId = createBizCardDivId(jobNumber);
        const originalBizCardDiv = document.getElementById(originalBizCardDivId);
        return originalBizCardDiv; // May be null if not found in DOM, that's OK
    } catch (error) {
        console.warn('getOriginalBizCardDiv: Failed to get original div:', error.message);
        return null;
    }
}

/**
 * Start with a basic context string.
 * If the bizCardDiv is a clone or has a clone, then create 
 * SkillBadges that cluster around the clone, add the 
 * that cluster around the clone, add the BadgeInfo object
 * to the bizCardDiv, and append the badgeInfo to the 
 * context string.
 * @param {*} bizCardDiv 
 * @returns an informative context string that can be used
 * for bizCardDivs and bizResumeDivs.
 */
export function createBizCardDetailsDiv(bizCardDiv) {
    if (!bizCardDiv) throw new Error('createBizCardDetailsDiv: bizCardDiv is null');
    const jobNumber = getValidatedJobNumber(bizCardDiv);
    // Creating biz details div for job

    const bizCardDetailsDiv = document.createElement('div');
    bizCardDetailsDiv.id = createBizCardDetailsDivId(jobNumber);
    bizCardDetailsDiv.classList.add(createBizCardDetailsDivClass());

    const jobSkills = getJobSkills(jobNumber);
    const numJobSkills = jobSkills.length;

    // Set pointer-events to none so clicks pass through to the parent bizCardDiv
    bizCardDetailsDiv.style.pointerEvents = 'none';
    bizCardDetailsDiv.style.backgroundColor = 'transparent';
    
    // see createBizDetailsDiv::34  colorIndex format <number>
    let colorIndex = bizCardDiv.getAttribute('data-color-index');
    if ( colorIndex == null || !utils.isNumericString(colorIndex) ) {
        throw new Error('createBizDetailsDiv: given null or non-numeric colorIndex from bizCardDiv:', bizCardDiv);
    }
    if ( colorIndex != jobNumber ) throw new Error('createBizDetailsDiv: colorIndex != jobNumber');
    bizCardDetailsDiv.setAttribute("data-color-index", colorIndex);
    bizCardDetailsDiv.classList.add('color-index-foreground-only');

    // gather the job details
    const job = jobsData[jobNumber];
    if ( job == null ) throw new Error('createBizDetailsDiv: job not found');
    const employer = job.employer || 'Unknown Employer';
    const role = job.role || 'Unknown Role';
    const start = job.start || '1970-01-01';
    const end = job.end || '1970-02-01';
    const dates = formatDateRange(start, end);
    const description = job.Description  || 'No description provided';
    const descriptions = description ? description.split(BULLET).filter(d => d.trim()) : [];
    const subContextStr = createBizCardSubContextString(bizCardDiv);
    // Sub-context string created

    // create the innerHTML of the bizCardDetailsDiv
    bizCardDetailsDiv.innerHTML = 
    `
    <h2 class="biz-details-employer header-text">${employer}</h2>
    <h3 class="biz-details-role header-text">${role}</h3>
    <p class="biz-details-dates header-text">${dates}</p>
    <p class="biz-details-z-value header-text">${subContextStr}</p>

    // create bulleted list of job descriptions
    <div class="job-description-items-container">
        ${descriptions.map(item => `<p class="job-description-item">&bull;&nbsp;${item.trim()}</p>`).join('')}
    </div>

    // create bulleted list of job skills
    <p class="biz-details-skills">
        ${jobSkills
            .map(skill => skill.trim()) // Remove whitespace around skills
            .filter(skill => skill)     // Remove empty skills
            .join(' &bull; ')}
    </p>
    `;

    const cardSubContextElement = document.createElement('p');
    cardSubContextElement.innerHTML = createBizCardSubContextString(bizCardDiv);
    bizCardDetailsDiv.insertAdjacentHTML('beforeend', cardSubContextElement.innerHTML);

    return bizCardDetailsDiv;
}



export function getJobSkills(jobNumber) {
    const job = jobsData[jobNumber];
    if (!job) throw new Error('getSkills: given null job');
    const jobSkills = job['job-skills'] || {};   
    const _jobSkills = (jobSkills && typeof jobSkills === 'object' && !Array.isArray(jobSkills))
    ? Object.values(jobSkills) || []
    : [];
    return _jobSkills;
}

/**
 * Returns the sceneZ of the original bizCardDiv. 
 * If the given bizCardDiv is a clone, get the original
 * bizCardDiv of that clone.
 * @param {HTMLElement} bizCardDiv - The bizCardDiv (original or clone)
 * @returns {string} sceneZ
 */
export function getBizCardDivSceneZ(bizCardDiv) {
    const originalBizCardDiv = getOriginalBizCardDiv(bizCardDiv);
    if (!originalBizCardDiv) {
        // Note: Could not find original bizCardDiv for scene Z calculation
        return null;
    }
    
    // Instead of reading potentially NaN data-sceneZ, calculate from DOM position
    const rect = originalBizCardDiv.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        return 'hidden'; // Element is not visible
    }
    
    // Use a simple Z calculation based on DOM position
    // This gives a consistent, non-NaN result
    const zIndex = originalBizCardDiv.style.zIndex || '10';
    return zIndex;
}

/**
 * create the subContextStr for the given bizCardDiv.
 * The SkillBadges component handles badge creation and positioning automatically
 * when a clone is selected, so we just need to get badge info from it.
 * @param {*} bizCardDiv 
 */
export function createBizCardSubContextString(bizCardDiv) {
    try {
        const jobNumber = getValidatedJobNumber(bizCardDiv);
        const sceneZ = getBizCardDivSceneZ(bizCardDiv) || 'unknown';
        const jobSkills = getJobSkills(jobNumber);
        const numJobSkills = jobSkills.length;

        // create the basic subContextStr that can be used
        // by any bizCardDiv or bizResumeDiv
        let subContextStr = `(z:${sceneZ},#:${jobNumber},#skl:${numJobSkills}`;

        // if a bizCardDivClone is available in the DOM, the SkillBadges component
        // will handle badge creation and positioning automatically through Vue reactivity
        const bizCardDivClone = getBizCardDivClone(bizCardDiv);
        if (bizCardDivClone != null) {
            // The SkillBadges.vue component manages badge positioning automatically
            // We can get badge counts from the existing badgesInfo if available
            const existingBadgesInfo = bizCardDivClone.getAttribute('data-badges-info');
            if (existingBadgesInfo) {
                try {
                    const badgesInfo = JSON.parse(existingBadgesInfo);
                    const aboveCount = badgesInfo.aboveCount || 0;
                    const levelCount = badgesInfo.levelCount || 0;
                    const belowCount = badgesInfo.belowCount || 0;
                    const totalCount = aboveCount + levelCount + belowCount;
                    subContextStr += `,#bgs:${totalCount} above:${aboveCount},level:${levelCount},below:${belowCount}`;
                } catch (e) {
                    console.warn('Failed to parse existing badges info:', e);
                }
            }
        }
        // close the subContentStr
        subContextStr += ')';
        return subContextStr;
        
    } catch (error) {
        console.warn('createBizCardSubContextString: Failed to create context string:', error.message);
        return '(z:unknown,#:unknown,#skl:unknown)';
    }
}



export function getBizResumeContextStr(bizResumeDiv) {
    const jobNumber = getValidatedJobNumber(bizResumeDiv);
    const jobSkills = getJobSkills(jobNumber);
    const numJobSkills = jobSkills.length;
    
    // Get the actual DOM bounds instead of relying on potentially NaN data-scene attributes
    const rect = bizResumeDiv.getBoundingClientRect();
    const top = rect.top.toFixed(1);
    const height = rect.height.toFixed(1);
    const bottom = rect.bottom.toFixed(1);
    
    const subContextStr = `(#:${jobNumber} #skl:${numJobSkills} top:${top} btm:${bottom})`;
    return subContextStr;
}

/**
 * Gets or creates badge information for a biz card div clone.
 * This is a stub implementation - full badge creation should be handled 
 * by the SkillBadges Vue component.
 * @param {HTMLElement} bizCardDivClone - The biz card div clone element
 * @returns {Object} Badge information with counts and badges array
 */
export function getBizCardDivBadges(bizCardDivClone) {
    if (!bizCardDivClone) throw new Error('getBizCardDivBadges: bizCardDivClone is null');
    
    const jobNumber = getValidatedJobNumber(bizCardDivClone);
    const jobSkills = getJobSkills(jobNumber);
    
    // Check if badges info already exists
    const existingBadgesInfo = bizCardDivClone.getAttribute('data-badges-info');
    if (existingBadgesInfo) {
        try {
            return JSON.parse(existingBadgesInfo);
        } catch (e) {
            console.warn('Failed to parse existing badges info, creating new:', e);
        }
    }
    
    // Create stub badges info - in full implementation, this should interact
    // with the SkillBadges Vue component to get actual badge positions
    const badgesInfo = {
        aboveCount: 0,
        levelCount: 0, 
        belowCount: 0,
        totalCount: 0,
        badges: jobSkills.map((skill, index) => ({
            id: `badge-${jobNumber}-${index}`,
            skill: skill,
            jobNumber: jobNumber,
            position: { x: 0, y: 0 }, // Placeholder positions
            level: 'level' // Placeholder level
        }))
    };
    
    badgesInfo.totalCount = badgesInfo.badges.length;
    badgesInfo.levelCount = badgesInfo.totalCount; // All at level for now
    
    return badgesInfo;
}