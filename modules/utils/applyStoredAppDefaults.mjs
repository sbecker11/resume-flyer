import { reportError } from './errorReporting.mjs';

/**
 * Fields from app_state.default.json that replace initialized app variables.
 * Selection and focal point are applied after normal startup so initialization
 * cannot leave its own card or mode in place.
 * @param {unknown} state
 * @returns {{ 'user-settings': Record<string, unknown> }}
 */
export function userSettingsOverridesFromDefaultState(state) {
    const settings = state && typeof state === 'object' ? state['user-settings'] : null;
    if (!settings || typeof settings !== 'object') {
        const err = new Error('[applyStoredAppDefaults] app_state.default.json is missing user-settings');
        reportError(err, '[applyStoredAppDefaults] Cannot overwrite initialized app variables');
        throw err;
    }

    const userSettings = {
        selectedBizCard: settings.selectedBizCard ?? null,
        selectedSkillCard: settings.selectedSkillCard ?? null,
    };
    if (settings.focalPointMode != null && settings.focalPointMode !== '') {
        userSettings.focalPointMode = settings.focalPointMode;
    }
    if (settings.focalPoint && typeof settings.focalPoint === 'object') {
        userSettings.focalPoint = { ...settings.focalPoint };
    }
    return { 'user-settings': userSettings };
}
