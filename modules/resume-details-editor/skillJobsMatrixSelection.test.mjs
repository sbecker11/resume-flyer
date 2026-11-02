import { describe, expect, it } from 'vitest'
import {
    emptySkillJobsHighlight,
    skillJobsHighlightAfterClick,
    skillJobsHighlightAfterEscape,
    skillJobsHighlightAfterSkillRemoved,
} from './skillJobsMatrixSelection.mjs'

describe('skillJobsMatrixSelection', () => {
    const none = emptySkillJobsHighlight()

    it('selects a job column without clearing the skill row', () => {
        const withRow = skillJobsHighlightAfterClick(none, { kind: 'skill', skillId: 'Kafka' })
        const both = skillJobsHighlightAfterClick(withRow, { kind: 'job', jobIndex: 2 })
        expect(both).toEqual({ jobIndex: 2, skillId: 'Kafka' })
        expect(skillJobsHighlightAfterClick(both, { kind: 'job', jobIndex: 0 })).toEqual({
            jobIndex: 0,
            skillId: 'Kafka',
        })
        expect(skillJobsHighlightAfterClick(both, { kind: 'job', jobIndex: 2 })).toEqual({
            jobIndex: 2,
            skillId: 'Kafka',
        })
    })

    it('selects a skill row without clearing the job column', () => {
        const withColumn = skillJobsHighlightAfterClick(none, { kind: 'job', jobIndex: 1 })
        const both = skillJobsHighlightAfterClick(withColumn, { kind: 'skill', skillId: 'Docker' })
        expect(both).toEqual({ jobIndex: 1, skillId: 'Docker' })
        expect(skillJobsHighlightAfterClick(both, { kind: 'skill', skillId: 'Airflow' })).toEqual({
            jobIndex: 1,
            skillId: 'Airflow',
        })
    })

    it('leaves both highlights in place when a body cell is clicked', () => {
        const both = skillJobsHighlightAfterClick(
            skillJobsHighlightAfterClick(none, { kind: 'job', jobIndex: 3 }),
            { kind: 'skill', skillId: 'Java' },
        )
        expect(skillJobsHighlightAfterClick(both, { kind: 'cell' })).toEqual({
            jobIndex: 3,
            skillId: 'Java',
        })
    })

    it('clears both when the click is outside names and body cells', () => {
        const both = skillJobsHighlightAfterClick(
            skillJobsHighlightAfterClick(none, { kind: 'job', jobIndex: 4 }),
            { kind: 'skill', skillId: 'Java' },
        )
        expect(skillJobsHighlightAfterClick(both, { kind: 'outside' })).toEqual({
            jobIndex: null,
            skillId: null,
        })
    })

    it('clears the skill row after that skill is removed and keeps the job column', () => {
        const both = skillJobsHighlightAfterClick(
            skillJobsHighlightAfterClick(none, { kind: 'skill', skillId: 'Vite' }),
            { kind: 'job', jobIndex: 2 },
        )
        expect(skillJobsHighlightAfterSkillRemoved(both)).toEqual({ jobIndex: 2, skillId: null })
        expect(skillJobsHighlightAfterSkillRemoved({ jobIndex: null, skillId: 'Vite' })).toEqual({
            jobIndex: null,
            skillId: null,
        })
        expect(skillJobsHighlightAfterSkillRemoved(none)).toEqual(none)
    })

    it('clears both on Escape', () => {
        const both = skillJobsHighlightAfterClick(
            skillJobsHighlightAfterClick(none, { kind: 'skill', skillId: 'Python' }),
            { kind: 'job', jobIndex: 1 },
        )
        expect(skillJobsHighlightAfterEscape(both)).toEqual({ jobIndex: null, skillId: null })
        expect(skillJobsHighlightAfterEscape(none)).toEqual({ jobIndex: null, skillId: null })
    })

    it('rejects a highlight or click that cannot be applied', () => {
        expect(() => skillJobsHighlightAfterClick(null, { kind: 'outside' })).toThrow(/highlight must be an object/)
        expect(() => skillJobsHighlightAfterClick({ jobIndex: -1, skillId: null }, { kind: 'outside' })).toThrow(/invalid/)
        expect(() => skillJobsHighlightAfterClick({ jobIndex: 0, skillId: '' }, { kind: 'cell' })).toThrow(/invalid/)
        expect(() => skillJobsHighlightAfterClick(none, null)).toThrow(/click target must be an object/)
        expect(() => skillJobsHighlightAfterClick(none, { kind: 'job', jobIndex: -1 })).toThrow(/jobIndex/)
        expect(() => skillJobsHighlightAfterClick(none, { kind: 'skill', skillId: '' })).toThrow(/skillId/)
        expect(() => skillJobsHighlightAfterClick(none, { kind: 'other' })).toThrow(/unknown click kind/)
        expect(() => skillJobsHighlightAfterEscape({ jobIndex: 1.5, skillId: null })).toThrow(/invalid/)
    })
})
