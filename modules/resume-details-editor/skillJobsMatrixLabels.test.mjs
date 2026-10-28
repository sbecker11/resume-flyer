import { describe, expect, it } from 'vitest'
import {
    jobColumnHeaderText,
    rotatedJobHeaderRowMinPx,
    rotatedLabelHeaderMinPx,
    skillRowDisplayLabel,
} from './skillJobsMatrixLabels.mjs'

describe('skillJobsMatrixLabels', () => {
    it('marks an unused skill with (0) after the name and keeps month totals for used skills', () => {
        expect(skillRowDisplayLabel('Docker', 0, 0)).toBe('Docker (0)')
        expect(skillRowDisplayLabel('Kafka', 2, 18)).toBe('Kafka (18)')
        expect(skillRowDisplayLabel('Airflow', 1, 0)).toBe('Airflow')
    })

    it('marks a job with no skills as (0) before the name', () => {
        expect(jobColumnHeaderText('Adobe', 0, 8)).toBe('(0) Adobe')
        expect(jobColumnHeaderText('Cigna', 3, 8)).toBe('(8) Cigna')
        expect(jobColumnHeaderText('NuSkin', 2, 0)).toBe('NuSkin')
    })

    it('sizes the header row to the tallest −45° job label', () => {
        const shortLabel = rotatedLabelHeaderMinPx(40, 10)
        const longLabel = rotatedLabelHeaderMinPx(200, 10)
        expect(longLabel).toBeGreaterThan(shortLabel)
        expect(rotatedJobHeaderRowMinPx([
            { width: 40, height: 10 },
            { width: 200, height: 10 },
        ])).toBe(longLabel)
        expect(rotatedJobHeaderRowMinPx([])).toBe(0)
    })

    it('rejects a label size that cannot be measured', () => {
        expect(() => rotatedLabelHeaderMinPx(-1, 10)).toThrow(/non-negative finite/)
    })
})