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

    // Create details info and use unified function with 'resume' context
    const detailsInfo = createBizCardDetailsInfo(bizCardDiv);
    const bizResumeDetailsDiv = createBizDetailsDiv(detailsInfo, 'resume');
    
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
    
    // Check if bizCardDiv itself is a clone
    if ( bizCardDiv.id && bizCardDiv.id.indexOf('clone') != -1 ) {
        return bizCardDiv;
    }
    
    // Look for clone by ID pattern
    const cloneId = bizCardDiv.id + '-clone';
    const bizCardDivClone = document.getElementById(cloneId);
    
    return bizCardDivClone; // Returns null if not found
}

/**
 * If the bizCardDiv is not a clone return it
 * if it is a clone then find and return the original bizCardDiv
 * @param {HTMLElement} bizCardDiv 
 * @returns {HTMLElement} the bizCardDivClone or null if not found
 */
export function getOriginalBizCardDiv(bizCardDiv) {
    if ( bizCardDiv == null ) {
        console.log("DEBUG: getOriginalBizCardDiv bizCardDiv is null");
        return null;
    }
    let id = bizCardDiv.id;
    if ( id.indexOf('-clone') == -1 ) {
        console.log("DEBUG: getOriginalBizCardDiv: returning id:", bizCardDiv.id);
        return bizCardDiv;
    }
    id = id.replace('-clone', '');
    const originalBizCardDiv = document.getElementById(id);
    if ( originalBizCardDiv == null ) {
        console.log("DEBUG: getOriginalBizCardDiv: originalBizCardDiv not found for id:", id);
        return null;
    }
    console.log("DEBUG: getOriginalBizCardDiv: returning originalBizCardDiv.id:", originalBizCardDiv.id);
    return originalBizCardDiv;
}

/**
   * @param {*} bizCardDiv
   * @returns float or throws error if non-numeric sceneZ
   */
export function getValidatedSceneZ(bizCardDiv) {
    if ( bizCardDiv ==  null ) {
        // console.log("DEBUG: getValidatedSceneZ: bizCardDiv null");
        return null;
    }
    const originalBizCardDiv = getOriginalBizCardDiv(bizCardDiv); 
    if (!originalBizCardDiv) {
        // console.log("DEBUG: getValidatedSceneZ: originalBizCardDiv not found for bizCardDiv.id:", bizCardDiv.id);
        return null;
    }
    // console.log("DEBUG: getValidatedSceneZ originalBizCardDiv.id:", originalBizCardDiv.id);
    const sceneZ = originalBizCardDiv.getAttribute('data-sceneZ');
    if ( sceneZ && !utils.isNumericString(sceneZ) ) {
        throw new Error('getValidatedSceneZ: non-numeric sceneZ:', sceneZ);
    }
    // console.log("DEBUG: getValidatedSceneZ sceneZ:", sceneZ);
    return parseFloat(sceneZ);
};

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
export function createBizCardDetailsInfo(bizCardDiv) {
    if (!bizCardDiv) throw new Error('createBizCardDetailsDiv: bizCardDiv is null');
    const jobNumber = getValidatedJobNumber(bizCardDiv);
    const jobSkills = getJobSkills(jobNumber);
    let colorIndex = bizCardDiv.getAttribute('data-color-index');
    if ( colorIndex == null || !utils.isNumericString(colorIndex) ) {
        throw new Error(`createBizCardDetailsInfo: given null or non-numeric colorIndex "${colorIndex}" from bizCardDiv.id: ${bizCardDiv.id || 'unknown'}`);
    }
    if ( colorIndex != jobNumber ) throw new Error('createBizCardDetailsInfo: colorIndex != jobNumber');

    // gather the job details
    const job = jobsData[jobNumber];
    if ( job == null ) throw new Error('createBizCardDetailsInfo: job not found');

    const description = job.Description  || 'No description provided';
    const descriptions = description ? description.split(BULLET).filter(d => d.trim()) : [];

    // if a bizCardDivClone is available in the DOM, the SkillBadges component
    // will have created a badges_info object and attached it to the bizCardDivClone
    // as an attribute.
    let badgesInfo = null;
    const bizCardDivClone = getBizCardDivClone(bizCardDiv);
    if (bizCardDivClone !== null) {
        badgesInfo = bizCardDivClone.getAttribute('data-badges-info');
    }

    // collect the details info for the bizCardDetailsDiv
    const detailsInfo = {
        jobNumber: jobNumber,
        employer: job.employer,
        role: job.role,
        dates: formatDateRange(job.start, job.end),
        sceneZ: getValidatedSceneZ(bizCardDiv),
        descriptions: descriptions,
        colorIndex: colorIndex,
        jobSkills: jobSkills,
        badgesInfo: badgesInfo
    };
    
    return detailsInfo;
}

/**
 * Creates a unified details div that works for both card and resume contexts
 * @param {Object} detailsInfo - The details info object from createBizCardDetailsInfo
 * @param {string} context - 'card' for limited space, 'resume' for full content
 * @returns {HTMLElement} The created details div
 */
export function createBizDetailsDiv(detailsInfo, context = 'card') {
    if (!detailsInfo) throw new Error('createBizDetailsDiv: detailsInfo is null');
    
    const isCardContext = context === 'card';
    const detailsDiv = document.createElement('div');
    
    // Set up div properties based on context
    if (isCardContext) {
        detailsDiv.id = createBizCardDetailsDivId(detailsInfo.jobNumber);
        detailsDiv.classList.add(createBizCardDetailsDivClass());
    } else {
        detailsDiv.id = createBizResumeDetailsDivId(detailsInfo.jobNumber);
        detailsDiv.classList.add(createBizResumeDetailsDivClass());
    }
    
    // Set pointer-events to none so clicks pass through to parent
    detailsDiv.style.pointerEvents = 'none';
    detailsDiv.style.backgroundColor = 'transparent';
    
    // Set color index
    detailsDiv.setAttribute("data-color-index", detailsInfo.colorIndex);
    detailsDiv.classList.add('color-index-foreground-only');

    // Create subcontext string with badge info if available
    let subContextStr = `(z:${detailsInfo.sceneZ},#:${detailsInfo.jobNumber},#skl:${detailsInfo.jobSkills.length}`;
    
    if (detailsInfo.badgesInfo) {
        try {
            const badgesInfo = typeof detailsInfo.badgesInfo === 'string' 
                ? JSON.parse(detailsInfo.badgesInfo) 
                : detailsInfo.badgesInfo;
            const aboveCount = badgesInfo.aboveCount || 0;
            const levelCount = badgesInfo.levelCount || 0;
            const belowCount = badgesInfo.belowCount || 0;
            const totalCount = aboveCount + levelCount + belowCount;
            subContextStr += `,#bgs:${totalCount} above:${aboveCount},level:${levelCount},below:${belowCount}`;
        } catch (e) {
            console.warn('Failed to parse badges info:', e);
        }
    }
    subContextStr += ')';

    // Build HTML content based on context
    if (isCardContext) {
        // Card context: compact content for limited real estate
        detailsDiv.innerHTML = `
            <h2 class="biz-details-employer header-text">${detailsInfo.employer}</h2>
            <h3 class="biz-details-role header-text">${detailsInfo.role}</h3>
            <p class="biz-details-dates header-text">${detailsInfo.dates}</p>
            <p class="biz-details-z-value header-text">${subContextStr}</p>
        `;
    } else {
        // Resume context: full content with unlimited real estate
        detailsDiv.innerHTML = `
            <h2 class="biz-details-employer header-text">${detailsInfo.employer}</h2>
            <h3 class="biz-details-role header-text">${detailsInfo.role}</h3>
            <p class="biz-details-dates header-text">${detailsInfo.dates}</p>
            <p class="biz-details-z-value header-text">${subContextStr}</p>

            <div class="job-description-items-container">
                ${detailsInfo.descriptions.map(item => `<p class="job-description-item">&bull;&nbsp;${item.trim()}</p>`).join('')}
            </div>

            <p class="biz-details-skills">
                ${detailsInfo.jobSkills
                    .map(skill => skill.trim())
                    .filter(skill => skill)
                    .join(' &bull; ')}
            </p>
        `;
    }

    return detailsDiv;
}

/**
 * use the detailsInfo to create the bizCardDetailsDiv
 * @param {*} bizCardDiv 
 * @returns 
 */
export function createBizCardDetailsDiv(bizCardDiv) {
    const detailsInfo = createBizCardDetailsInfo(bizCardDiv);
    return createBizDetailsDiv(detailsInfo, 'card');
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
 * If the given bizCardDiv is a clone, find and use the original
 * bizCardDiv of that clone.  If the original bizCardDiv is not found,
 * return null.
 * @param {HTMLElement} bizCardDiv - The bizCardDiv (original or clone)
 * @returns {string} sceneZ
 */
export function getSceneZ(jobNumber) {
    const bizCardDivId = createBizCardDivId(jobNumber);
    const bizCardDiv = document.getElementById(bizCardDivId);
    if (!bizCardDiv) {
        console.log("DEBUG: getBizCardDivSceneZ: bizCardDiv not found for jobNumber:", jobNumber);
        return null;
    }
    const originalBizCardDiv = getOriginalBizCardDiv(bizCardDiv);
    if (!originalBizCardDiv) {
        // Note: Could not find original bizCardDiv for scene Z calculation
        return null;
    }
    return getValidatedSceneZ(originalBizCardDiv);
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
        let sceneZ = getValidatedSceneZ(bizCardDiv);
        if ( !sceneZ ) {
            console.log("DEBUG: createBizCardSubContextString: sceneZ is splat");
            sceneZ = 'splat';
        }
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
 * Gathers badge information for a biz card div clone that is present on the DOM
 * @param {HTMLElement} bizCardDivClone - The biz card div clone element
 * @returns {Object} Badge information with counts and badges array
 */
export function createBadgesInfo(bizCardDivClone) {
    if (!bizCardDivClone) throw new Error('createBadgesInfo: bizCardDivClone is null');
    
    const jobNumber = getValidatedJobNumber(bizCardDivClone);
    const jobSkills = getJobSkills(jobNumber);
 
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