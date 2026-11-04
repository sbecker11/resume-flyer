import { describe, expect, it } from 'vitest'
import {
    ignoreProjectLinkClick,
    projectLinksForJob,
    projectSlug,
} from './projectLinks.mjs'

describe('projectLinksForJob', () => {
    it('normalizes portfolio role and employer text', () => {
        expect(projectSlug('Portfolio Project: resume-flyer')).toBe('resume-flyer')
        expect(projectSlug('campaign asset automation')).toBe('campaign-asset-automation')
    })

    it('returns GitHub and GitHub Pages when the projects page lists both', () => {
        const links = projectLinksForJob({
            employer: 'resume-flyer',
            role: 'Portfolio Project: resume-flyer',
        })
        expect(links).toEqual({
            githubUrl: 'https://github.com/sbecker11/resume-flyer',
            pagesUrl: 'https://sbecker11.github.io/resume-flyer/',
        })
    })

    it('returns only the GitHub project when there is no Pages site', () => {
        expect(projectLinksForJob({ employer: 'resume-parser', role: 'Portfolio Project: resume-parser' })).toEqual({
            githubUrl: 'https://github.com/sbecker11/resume-parser',
            pagesUrl: '',
        })
        expect(projectLinksForJob({ employer: 'recruiting-automation', role: '' })).toEqual({
            githubUrl: 'https://github.com/sbecker11/recruiting-automation',
            pagesUrl: '',
        })
    })

    it('maps the sushi résumé card to the sushi-rag-app repository', () => {
        expect(projectLinksForJob({
            employer: 'sushi-rag-mcp-server',
            role: 'Portfolio Project: sushi-rag-mcp-server',
        })?.githubUrl).toBe('https://github.com/sbecker11/sushi-rag-app')
    })

    it('includes linkage-engine Pages and skips client jobs', () => {
        expect(projectLinksForJob({ employer: 'linkage-engine', role: 'Portfolio Project: linkage-engine' })?.pagesUrl)
            .toBe('https://sbecker11.github.io/linkage-engine/')
        expect(projectLinksForJob({ employer: 'Adobe', role: 'Consultant' })).toBeNull()
        expect(projectLinksForJob({ employer: 'campaign asset automation', role: 'Portfolio Project: campaign asset automation' })).toBeNull()
        expect(projectLinksForJob(null)).toBeNull()
    })
})

describe('ignoreProjectLinkClick', () => {
    it('stops the card handler without cancelling the new window', () => {
        const link = document.createElement('a')
        link.className = 'biz-card-project-link'
        link.href = 'https://github.com/sbecker11/resume-flyer'
        link.target = '_blank'
        const event = new MouseEvent('click', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'target', { value: link })
        let stopped = false
        event.stopImmediatePropagation = () => { stopped = true }
        expect(ignoreProjectLinkClick(event)).toBe(true)
        expect(stopped).toBe(true)
        expect(event.defaultPrevented).toBe(false)
    })

    it('ignores clicks that are not project links', () => {
        const event = new MouseEvent('click', { bubbles: true })
        Object.defineProperty(event, 'target', { value: document.createElement('div') })
        expect(ignoreProjectLinkClick(event)).toBe(false)
    })
})
