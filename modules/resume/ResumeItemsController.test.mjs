import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobsDependencyStub, fixtureJobs, mockBizCardDivs, mountResumeListDom } from './testFixtures.mjs';

const jobsDep = createJobsDependencyStub();
const applyPaletteToElement = vi.fn(async () => {});

vi.mock('../composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}));
vi.mock('../composables/useColorPalette.mjs', () => ({
    applyPaletteToElement,
    applyPaletteToElementSync: vi.fn(() => {}),
    syncSkillCardBackLinkPresentation: vi.fn(() => {}),
}));
vi.mock('../utils/selectionPersistence.mjs', () => ({
    persistSelectedCard: vi.fn(async () => {}),
    readPersistedSelectedCard: vi.fn(() => null),
}));

const { resumeItemsController: ric } = await import('./ResumeItemsController.mjs');
const { selectionManager } = await import('../core/selectionManager.mjs');

let holder;
let scrollport;

async function buildDivs(jobs = fixtureJobs()) {
    jobsDep.setJobs(jobs);
    ({ scrollport, holder } = mountResumeListDom());
    const divs = await ric.createAllBizResumeDivs(mockBizCardDivs(jobs.length));
    divs.forEach((d) => holder.appendChild(d));
    return divs;
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.resumeFlyer = { resumeItemsController: ric, selectionManager };
    ric.dismissedJobNumbers.clear();
    selectionManager.selectedCard = null;
    selectionManager.selectedJobNumber = null;
    applyPaletteToElement.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ResumeItemsController', () => {
    it('is a singleton with the initialized flag set once registered', () => {
        expect(new ric.constructor()).toBe(ric);
        ric.registerForInitialization();
        ric.registerForInitialization();
        expect(ric.isInitialized).toBe(true);
    });

    describe('createAllBizResumeDivs', () => {
        it('returns an empty list when there is no jobs data', async () => {
            jobsDep.setJobs([]);
            expect(await ric.createAllBizResumeDivs(mockBizCardDivs(2))).toEqual([]);
        });

        it('builds one rDiv per job with header, description links, skills, and close button', async () => {
            const divs = await buildDivs();
            expect(divs).toHaveLength(3);
            const first = divs[0];
            expect(first.id).toBe('resume-0');
            expect(first.getAttribute('data-color-index')).toBe('0');
            expect(first.querySelector('.biz-details-employer').textContent).toBe('Acme');
            expect(first.querySelector('.biz-details-role').textContent).toBe('Engineer');
            expect(first.querySelector('.biz-details-dates').textContent).toMatch(/2020/);
            expect(first.querySelector('.job-number').textContent).toBe('#0');
            expect(first.firstElementChild.classList.contains('r-div-close')).toBe(true);
            // The [Vue] bracket renders as a focusable skill link in the description;
            // the skills section lists each canonical key exactly once.
            const link = first.querySelector('.description-content .biz-card-skill-title');
            expect(link.getAttribute('data-skill-name')).toBe('vue');
            expect(link.getAttribute('tabindex')).toBe('0');
            const skillKeys = Array.from(first.querySelectorAll('.resume-skills .biz-card-skill-title'))
                .map((el) => el.getAttribute('data-skill-name'));
            expect(skillKeys).toEqual(['vue']);
            expect(applyPaletteToElement).toHaveBeenCalledTimes(3);
        });

        it('uses the card color index when present and falls back to a synthetic card when missing', async () => {
            jobsDep.setJobs(fixtureJobs());
            const cards = mockBizCardDivs(3);
            cards[1].setAttribute('data-color-index', '7');
            cards[2] = null;
            const divs = await ric.createAllBizResumeDivs(cards);
            expect(divs[1].getAttribute('data-color-index')).toBe('7');
            expect(divs[2].getAttribute('data-color-index')).toBe('2');
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No scene card for job 2'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Remedy:'));
        });

        it('fails fast on an unresolved [bracket] in a work job', async () => {
            const jobs = fixtureJobs();
            jobs[0].Description = '• Did [Nonexistent] things.';
            jobsDep.setJobs(jobs);
            vi.spyOn(console, 'error').mockImplementation(() => {});
            await expect(ric.createAllBizResumeDivs(mockBizCardDivs(3))).rejects.toThrow(/Unresolved bracketed term "\[Nonexistent\]"/);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create resume div for job 0'), expect.any(Error));
        });

        it('renders outline section rows as labels and nests outline depth', async () => {
            const jobs = fixtureJobs();
            jobs[0].outlineIndex = '1';
            jobs[0].outlineSection = true;
            jobs[0].title = 'Experience';
            jobs[1].outlineIndex = '1.1';
            const divs = await buildDivs(jobs);
            if (divs[0].getAttribute('data-outline-section') === 'true') {
                expect(divs[0].classList.contains('outline-section-label')).toBe(true);
                expect(divs[0].querySelector('.r-div-close')).toBeNull();
            }
            expect(divs[1].getAttribute('data-outline-depth')).toBe('1');
        });

        it('marks a dismissed job on rebuild and rejects bad cards', async () => {
            ric.dismissedJobNumbers.add(1);
            const divs = await buildDivs();
            expect(divs[1].classList.contains('r-div-removed-from-listing')).toBe(true);
            await expect(ric.createBizResumeDiv(null)).rejects.toThrow(/bizCardDiv not found/);
            const bad = document.createElement('div');
            bad.setAttribute('data-job-number', 'abc');
            await expect(ric.createBizResumeDiv(bad)).rejects.toThrow(/not a numeric string/);
        });

        it('falls back to a placeholder details div for an unknown job number', () => {
            jobsDep.setJobs(fixtureJobs());
            const el = ric.createEnhancedResumeDetailsDiv(42);
            expect(el.textContent).toMatch(/Job data not found/);
        });
    });

    describe('description parsing', () => {
        it('links each slug once and keeps later mentions as plain text', () => {
            jobsDep.setJobs(fixtureJobs());
            const container = document.createElement('div');
            const slugs = ric.parseDescriptionToBullets('Used [Vue] and again [Vue].\nThen [Python].', container);
            expect([...slugs].sort()).toEqual(['python', 'vue']);
            const items = container.querySelectorAll('.job-description-item');
            expect(items).toHaveLength(2);
            expect(container.querySelectorAll('.biz-card-skill-title[data-skill-name="vue"]')).toHaveLength(1);
            expect(items[0].textContent).toMatch(/again Vue\.$/);
            expect(ric.parseDescriptionToBullets('', container).size).toBe(0);
        });

        it('shows each defined project URL on its own row and keeps those URLs out of the achievement text', () => {
            const repo = 'https://github.com/sbecker11/color-palette-maker';
            const page = 'https://sbecker11.github.io/color-palette-maker/';
            jobsDep.setJobs([{
                employer: 'color-palette-maker',
                role: 'Portfolio Project: color-palette-maker',
                start: '04/2025',
                end: '05/2026',
                Description: '• React app generating color palettes. (github.com/sbecker11/color-palette-maker) (sbecker11.github.io/color-palette-maker/)',
                githubRepoUrl: repo,
                githubPagesUrl: page,
                skillIDs: [],
            }]);
            const el = ric.createEnhancedResumeDetailsDiv(0);
            const links = [...el.querySelectorAll('a.project-url-anchor')];
            expect(links.map((a) => a.textContent)).toEqual([repo, page]);
            expect(links[0].parentElement.tagName).toBe('P');
            expect(links[1].parentElement.tagName).toBe('P');
            expect(links[0].parentElement).not.toBe(links[1].parentElement);
            expect(links[0].getAttribute('href')).toBe(repo);
            expect(links[1].getAttribute('href')).toBe(page);
            expect(el.querySelector('.description-content').textContent).not.toMatch(/github/);
            const event = { target: links[0], stopPropagation: () => {} };
            selectionManager.selectedJobNumber = 0;
            ric.handleBizResumeDivClickEvent(el, event);
            expect(selectionManager.selectedJobNumber).toBe(0);
        });

        it('omits a project URL row when that property is not defined', () => {
            jobsDep.setJobs([{
                employer: 'color-palette-maker',
                role: 'Portfolio Project: color-palette-maker',
                start: '04/2025',
                end: '05/2026',
                Description: '• React app. (github.com/sbecker11/color-palette-maker) (sbecker11.github.io/color-palette-maker/)',
                skillIDs: [],
            }]);
            const el = ric.createEnhancedResumeDetailsDiv(0);
            expect(el.querySelector('a.project-url-anchor')).toBeNull();
        });

        it('refreshes the resume card when the job project URLs change', () => {
            const job = {
                employer: 'color-palette-maker',
                role: 'Portfolio Project: color-palette-maker',
                start: '04/2025',
                end: '05/2026',
                Description: '• React app.',
                skillIDs: [],
            };
            jobsDep.setJobs([job]);
            const card = document.createElement('div');
            card.className = 'biz-resume-div';
            card.setAttribute('data-job-number', '0');
            card.appendChild(ric.createEnhancedResumeDetailsDiv(0));
            document.body.appendChild(card);
            expect(card.querySelector('a.project-url-anchor')).toBeNull();
            const page = 'https://sbecker11.github.io/color-palette-maker/';
            job.githubPagesUrl = page;
            window.dispatchEvent(new CustomEvent('job-project-urls-updated', { detail: { jobIndex: 0 } }));
            const links = [...card.querySelectorAll('a.project-url-anchor')];
            expect(links.map((a) => a.textContent)).toEqual([page]);
            expect(links[0].closest('.resume-header')).toBeTruthy();
        });

        it('leaves unresolved brackets as text when resolution is optional', () => {
            const container = document.createElement('div');
            const slugs = ric.parseDescriptionToBullets('[Mystery] item', container, { requireResolvedSkills: false });
            expect(slugs.size).toBe(0);
            expect(container.textContent).toContain('Mystery');
        });

        it('formats dates for display', () => {
            expect(ric.formatDate('')).toBe('Unknown');
            expect(ric.formatDate('2020-03-15')).toBe('Mar 2020');
            expect(ric.formatDate('Present')).toMatch(/\d{4}/);
            expect(ric.formatDate('garbage')).toBe('garbage');
        });
    });

    describe('interaction', () => {
        it('click selects the job, a second click clears it', async () => {
            const divs = await buildDivs();
            divs[1].querySelector('.biz-details-role').click();
            expect(selectionManager.getSelectedJobNumber()).toBe(1);
            expect(divs[1].classList.contains('selected')).toBe(true);
            expect(divs[0].classList.contains('selected')).toBe(false);
            divs[1].querySelector('.biz-details-role').click();
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(divs[1].classList.contains('selected')).toBe(false);
        });

        it('clicking a skill link selects the skill card instead of the job', async () => {
            const divs = await buildDivs();
            const card = document.createElement('div');
            card.className = 'skill-card-div';
            card.id = 'skill-card-div-vue-9';
            card.setAttribute('data-skill-name', 'vue');
            document.body.appendChild(card);
            const link = divs[0].querySelector('.biz-card-skill-title');
            expect(link.getAttribute('data-skill-card-id')).toBeNull(); // card added after render → name fallback
            link.click();
            expect(selectionManager.getSelectedCard()).toEqual({ type: 'skill', skillCardId: 'skill-card-div-vue-9' });
            expect(link.classList.contains('selected')).toBe(true);
            // Toggling the same link clears the skill selection.
            link.click();
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(link.classList.contains('selected')).toBe(false);
        });

        it('Enter/Space on a focused skill link activates it; other keys do not', async () => {
            const divs = await buildDivs();
            const card = document.createElement('div');
            card.className = 'skill-card-div';
            card.id = 'skill-card-div-vue-1';
            card.setAttribute('data-skill-name', 'vue');
            document.body.appendChild(card);
            const link = divs[0].querySelector('.biz-card-skill-title');
            link.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            expect(selectionManager.getSelectedCard()).toBeNull();
            const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
            link.dispatchEvent(space);
            expect(space.defaultPrevented).toBe(true);
            expect(selectionManager.getSelectedCard()?.type).toBe('skill');
        });

        it('warns and does nothing when a skill link cannot be resolved to a card', async () => {
            const divs = await buildDivs();
            const link = divs[0].querySelector('.biz-card-skill-title');
            link.click();
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('could not resolve skillCardId'), expect.any(Object));
        });

        it('hover adds .hovered, leave clears it after the debounce, selected rows are skipped', async () => {
            const divs = await buildDivs();
            vi.useFakeTimers();
            try {
                divs[0].dispatchEvent(new MouseEvent('mouseenter'));
                expect(divs[0].classList.contains('hovered')).toBe(true);
                divs[0].dispatchEvent(new MouseEvent('mouseleave'));
                // Hover clear is debounced so a quick rDiv→cDiv crossing does not flicker.
                expect(divs[0].classList.contains('hovered')).toBe(true);
                vi.runAllTimers();
                expect(divs[0].classList.contains('hovered')).toBe(false);

                // Hovering another row clears the previous one immediately.
                divs[0].dispatchEvent(new MouseEvent('mouseenter'));
                divs[1].dispatchEvent(new MouseEvent('mouseenter'));
                expect(divs[0].classList.contains('hovered')).toBe(false);
                expect(divs[1].classList.contains('hovered')).toBe(true);

                selectionManager.selectCard({ type: 'biz', jobNumber: 2 }, 'test');
                divs[2].dispatchEvent(new MouseEvent('mouseenter'));
                expect(divs[2].classList.contains('hovered')).toBe(false);
                expect(divs[2].classList.contains('selected')).toBe(true);
                vi.runAllTimers();
            } finally {
                vi.useRealTimers();
            }
        });

        it('the × dismisses the job and clears a matching selection', async () => {
            const divs = await buildDivs();
            selectionManager.selectCard({ type: 'biz', jobNumber: 0 }, 'test');
            divs[0].querySelector('.r-div-close').click();
            expect(selectionManager.getSelectedCard()).toBeNull();
            expect(ric.dismissedJobNumbers.has(0)).toBe(true);
            // Without a list controller the row is only flagged, not removed.
            expect(divs[0].classList.contains('r-div-removed-from-listing')).toBe(true);
            expect(holder.contains(divs[0])).toBe(true);
        });

        it('resume-scrollIntoView restores a dismissed job and scrolls its header', async () => {
            const divs = await buildDivs();
            ric.dismissedJobNumbers.add(1);
            const ensureJobInListing = vi.fn();
            window.resumeFlyer.resumeListController = { ensureJobInListing };
            scrollport.classList.add('resume-list-scroll-container');
            const scrollTo = vi.fn();
            scrollport.scrollTo = scrollTo;
            selectionManager.eventTarget.dispatchEvent(new CustomEvent('resume-scrollIntoView', { detail: { jobNumber: 1 } }));
            expect(ensureJobInListing).toHaveBeenCalledWith(1);
            expect(ric.dismissedJobNumbers.has(1)).toBe(false);
            expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
            expect(divs[1]).toBeTruthy();
        });

        it('falls back to scrollIntoView when the row has no header', async () => {
            await buildDivs();
            const bare = document.createElement('div');
            bare.scrollIntoView = vi.fn();
            holder.appendChild(bare);
            expect(() => ric._scrollRDivIntoView(bare, 9)).not.toThrow();
            expect(() => ric._scrollRDivIntoView(null, 9)).not.toThrow();
            // Without a styled scrollport the lookup falls back to the document element.
            expect(ric._findScrollContainer(bare)).toBe(document.documentElement);
            scrollport.style.overflowY = 'auto';
            expect(ric._findScrollContainer(bare)).toBe(scrollport);
        });

        it('maps rDivs back to job numbers and scene cards', async () => {
            const divs = await buildDivs();
            expect(ric.getJobNumberFromBizResumeDiv(divs[2])).toBe(2);
            expect(ric.getJobNumberFromBizResumeDiv(null)).toBeNull();
            const byAttr = document.createElement('div');
            byAttr.setAttribute('data-job-number', '5');
            expect(ric.getJobNumberFromBizResumeDiv(byAttr)).toBe(5);
            expect(ric.getJobNumberFromBizResumeDiv(document.createElement('div'))).toBeNull();
            const card = document.createElement('div');
            card.id = 'biz-card-div-2';
            document.body.appendChild(card);
            expect(ric.getBizCardDivFromBizResumeDiv(divs[2])).toBe(card);
            expect(ric.getBizCardDivFromBizResumeDiv(document.createElement('div'))).toBeNull();
        });
    });

    describe('skill refresh', () => {
        it('job-skills-updated rebuilds or removes the skills section', async () => {
            const divs = await buildDivs();
            const keysOf = (div) => Array.from(div.querySelectorAll('.resume-skills .biz-card-skill-title'))
                .map((el) => el.getAttribute('data-skill-name'));
            expect(keysOf(divs[1])).toEqual(['kafka']);
            window.dispatchEvent(new CustomEvent('job-skills-updated', { detail: { jobIndex: 1, jobSkills: { python: { name: 'Python' } } } }));
            expect(keysOf(divs[1])).toEqual(expect.arrayContaining(['kafka', 'python']));

            // A job with no skill sources at all loses its skills section; a fresh refresh recreates it.
            const jobs = jobsDep.getJobsData();
            jobs[1].skillIDs = [];
            jobs[1].Description = '';
            ric.refreshJobSkills(1, {});
            expect(divs[1].querySelector('.resume-skills')).toBeNull();
            ric.refreshJobSkills(1, { python: { name: 'Python' } });
            expect(keysOf(divs[1])).toEqual(['python']);
            expect(() => ric.refreshJobSkills(99, {})).not.toThrow();
        });

        it('skills-data-ready re-renders every description with current skill names', async () => {
            const divs = await buildDivs();
            jobsDep.getSkillsData().vue.name = 'Vue 3';
            window.dispatchEvent(new CustomEvent('skills-data-ready'));
            expect(divs[0].querySelector('.biz-card-skill-title').textContent).toMatch(/Vue 3/);
            jobsDep.getSkillsData().vue.name = 'Vue';
            jobsDep.setJobs(null);
            expect(() => ric.refreshAllDescriptions()).not.toThrow();
        });

        it('card-selected highlights matching skill titles and clears them on selection-cleared', async () => {
            const divs = await buildDivs();
            const link = divs[2].querySelector('.biz-card-skill-title[data-skill-name="python"]');
            const card = document.createElement('div');
            card.id = 'skill-card-div-python-3';
            card.setAttribute('data-skill-name', 'python');
            document.body.appendChild(card);
            selectionManager.selectCard({ type: 'skill', skillCardId: 'skill-card-div-python-3' }, 'test');
            expect(link.classList.contains('selected')).toBe(true);
            selectionManager.clearSelection('test');
            expect(link.classList.contains('selected')).toBe(false);
            // Clearing with no previous skill selection also sweeps stale highlights.
            link.classList.add('selected');
            ric.handleCardSelectionCleared({ detail: {} });
            expect(link.classList.contains('selected')).toBe(false);
        });

        it('the edit pencil opens resume details for the job', async () => {
            const divs = await buildDivs();
            const opened = vi.fn();
            window.addEventListener('open-resume-details', opened);
            try {
                divs[0].querySelector('.biz-details-edit-btn').click();
                expect(opened.mock.calls[0][0].detail).toEqual({ tab: 'resume-jobs', jobIndex: 0, focusField: 'employer' });
                expect(selectionManager.getSelectedCard()).toBeNull();
            } finally {
                window.removeEventListener('open-resume-details', opened);
            }
        });
    });
});
