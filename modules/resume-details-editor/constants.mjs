/**
 * resume-details-editor constants
 * Default shapes and field definitions for meta, other-sections, categories.
 * Standalone-ready: no imports from app.
 */

/** @typedef {Object} OtherSections
 * @property {string} [summary]
 * @property {string} [title]
 * @property {{ name?: string, email?: string, phone?: string, location?: string, linkedin?: string, website?: string }} [contact]
 * @property {{ name: string, url?: string, description?: string }[]} [certifications]
 * @property {{ label: string, url: string, description?: string }[]} [websites]
 * @property {{ title: string, subtitle?: string, description?: string }[]} [custom_sections]
 */

export const DEFAULT_OTHER_SECTIONS = Object.freeze({
    summary: '',
    title: '',
    contact: {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        website: ''
    },
    certifications: [],
    websites: [],
    custom_sections: []
});

export const TAB_IDS = Object.freeze({
    META: 'meta',
    OTHER_SECTIONS: 'other-sections',
    CATEGORIES: 'categories'
});
