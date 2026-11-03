/**
 * Test-only fixtures for the resume list controllers (happy-dom).
 * Not imported by app code. Excluded from coverage via the *Fixtures* name in vitest.config.js.
 */

/** Three work jobs with distinct start dates; job 1 starts latest, job 2 earliest. */
export function fixtureJobs() {
    return [
        {
            employer: 'Acme', role: 'Engineer', start: '2020-01-01', end: '2021-01-01',
            Description: '• Built a [Vue] app.', skillIDs: ['vue'],
        },
        {
            employer: 'Beta', role: 'Lead', start: '2022-03-01', end: 'Present',
            Description: '• [Kafka] streams.', skillIDs: ['kafka'],
        },
        {
            employer: 'Gamma', role: 'Staff', start: '2018-06-01', end: '2019-12-01',
            Description: '• [Python] tooling.', skillIDs: ['python'],
        },
    ];
}

/** Same jobs tagged with an outline index (tiered résumé): Gamma 1.1, Acme 1.2, Beta 2.1. */
export function fixtureOutlineJobs() {
    const jobs = fixtureJobs();
    jobs[0].outlineIndex = '1.2';
    jobs[1].outlineIndex = '2.1';
    jobs[2].outlineIndex = '1.1';
    return jobs;
}

export function fixtureSkills() {
    return {
        vue: { name: 'Vue', url: 'https://vuejs.org/', jobIDs: [0] },
        kafka: { name: 'Kafka', jobIDs: [1] },
        python: { name: 'Python', url: 'https://python.org/', jobIDs: [2] },
    };
}

/**
 * Minimal stand-in for getGlobalJobsDependency(). Tests swap `jobs` via setJobs().
 */
export function createJobsDependencyStub(jobs = fixtureJobs(), skills = fixtureSkills()) {
    const state = { jobs, skills };
    return {
        setJobs(next) { state.jobs = next; },
        getJobsData: () => state.jobs,
        getSkillsData: () => state.skills,
        getCategoriesData: () => ({}),
        loadJobs: async () => state.jobs,
        registerController: () => {},
        waitForJobs: async () => state.jobs,
        patchSkillData: () => {},
        isReady: { value: true },
        isLoading: { value: false },
        hasError: { value: false },
        jobsCount: { value: state.jobs.length },
    };
}

/** Scene-card stand-ins carrying only the attributes the resume list reads. */
export function mockBizCardDivs(count) {
    return Array.from({ length: count }, (_, i) => {
        const el = document.createElement('div');
        el.className = 'biz-card-div';
        el.id = `biz-card-div-${i}`;
        el.setAttribute('data-job-number', String(i));
        el.setAttribute('data-color-index', String(i));
        return el;
    });
}

/** Scrollport + content holder with the ids the controllers look up. */
export function mountResumeListDom() {
    document.body.innerHTML = '';
    const scrollport = document.createElement('div');
    scrollport.id = 'resume-content-listing';
    const holder = document.createElement('div');
    holder.id = 'resume-content-div-list';
    scrollport.appendChild(holder);
    document.body.appendChild(scrollport);
    return { scrollport, holder };
}

/** Job numbers of the biz rDivs currently in the list, in DOM order. */
export function listedJobNumbers(holder) {
    return Array.from(holder.querySelectorAll('.biz-resume-div:not(.resume-list-clone)'))
        .map((el) => parseInt(el.getAttribute('data-job-number'), 10));
}

/** An appended skill row as the scene creates it when a skill card is sent to the listing. */
export function appendedSkillDiv(skillCardId) {
    const el = document.createElement('div');
    el.className = 'appended-skill-resume-div';
    el.setAttribute('data-skill-card-id', skillCardId);
    return el;
}
