import { describe, it, expect, vi } from 'vitest';

vi.mock('./errorReporting.mjs', () => ({
    reportError: vi.fn(),
}));

import { reportError } from './errorReporting.mjs';
import { userSettingsOverridesFromDefaultState } from './applyStoredAppDefaults.mjs';

describe('userSettingsOverridesFromDefaultState', () => {
    it('copies the stored biz card, skill card, and focal point', () => {
        const patch = userSettingsOverridesFromDefaultState({
            'user-settings': {
                selectedBizCard: { 'card-id': 20 },
                selectedSkillCard: { 'card-id': 35 },
                focalPointMode: 'following',
                focalPoint: { x: 198.5, y: 268.5, mode: 'following' },
                currentResumeId: 'shawn-becker-full-resume-indexed',
            },
        });

        expect(patch['user-settings']).toEqual({
            selectedBizCard: { 'card-id': 20 },
            selectedSkillCard: { 'card-id': 35 },
            focalPointMode: 'following',
            focalPoint: { x: 198.5, y: 268.5, mode: 'following' },
        });
        expect(patch['user-settings'].currentResumeId).toBeUndefined();
    });

    it('keeps null card refs', () => {
        const patch = userSettingsOverridesFromDefaultState({
            'user-settings': {
                selectedBizCard: null,
                selectedSkillCard: null,
                focalPointMode: 'locked',
                focalPoint: { x: 10, y: 20, mode: 'locked' },
            },
        });

        expect(patch['user-settings'].selectedBizCard).toBeNull();
        expect(patch['user-settings'].selectedSkillCard).toBeNull();
        expect(patch['user-settings'].focalPointMode).toBe('locked');
    });

    it('throws when user-settings is missing', () => {
        expect(() => userSettingsOverridesFromDefaultState({})).toThrow(/user-settings/);
        expect(reportError).toHaveBeenCalled();
    });
});
