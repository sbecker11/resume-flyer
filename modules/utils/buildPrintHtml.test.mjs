// modules/utils/buildPrintHtml.test.mjs

import { describe, it, expect } from 'vitest';
import { buildPrintHtml } from './buildPrintHtml.mjs';

describe('buildPrintHtml', () => {
    it('returns HTML document with doctype', () => {
        const html = buildPrintHtml([], {}, {}, {});
        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('<html lang="en">');
    });

    it('includes header with contact name and title', () => {
        const html = buildPrintHtml([], {}, {}, {
            contact: { name: 'Jane Doe' },
            title: 'Software Engineer'
        });
        expect(html).toContain('<h1>Jane Doe</h1>');
        expect(html).toContain('Software Engineer');
    });

    it('includes summary when provided', () => {
        const html = buildPrintHtml([], {}, {}, { summary: 'Experienced developer' });
        expect(html).toContain('section-head">Summary');
        expect(html).toContain('Experienced developer');
    });

    it('includes job experience', () => {
        const jobs = [{
            role: 'Developer',
            employer: 'Acme',
            start: '2020-01',
            end: '2022-12',
            Description: '• Built apps'
        }];
        const html = buildPrintHtml(jobs, {}, {}, {});
        expect(html).toContain('Developer');
        expect(html).toContain('Acme');
        expect(html).toContain('section-head">Experience');
        expect(html).toContain('<li>Built apps</li>');
    });

    it('formats CURRENT_DATE as Present', () => {
        const jobs = [{ role: 'Dev', employer: 'Co', start: '2023-01', end: 'CURRENT_DATE' }];
        const html = buildPrintHtml(jobs, {}, {}, {});
        expect(html).toContain('Present');
    });

    it('includes skills by category', () => {
        const skills = { s1: { name: 'JavaScript' }, s2: { name: 'Python' } };
        const categories = { c1: { name: 'Languages', skillIDs: ['s1', 's2'] } };
        const html = buildPrintHtml([], skills, categories, {});
        expect(html).toContain('Languages');
        expect(html).toContain('JavaScript');
        expect(html).toContain('Python');
    });

    it('includes certifications with name and url', () => {
        const html = buildPrintHtml([], {}, {}, {
            certifications: [{ name: 'AWS', url: 'https://aws.amazon.com' }]
        });
        expect(html).toContain('section-head">Certifications');
        expect(html).toContain('href="https://aws.amazon.com"');
        expect(html).toContain('>AWS</a>');
    });

    it('includes certifications with legacy issuer and date', () => {
        const html = buildPrintHtml([], {}, {}, {
            certifications: [{ name: 'PMI', issuer: 'PMI', date: '2020' }]
        });
        expect(html).toContain('PMI');
        expect(html).toContain(' – ');
    });

    it('includes websites', () => {
        const html = buildPrintHtml([], {}, {}, {
            websites: [{ label: 'Portfolio', url: 'https://example.com' }]
        });
        expect(html).toContain('section-head">Websites');
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain('Portfolio');
    });

    it('includes other sections with title and content', () => {
        const html = buildPrintHtml([], {}, {}, {
            custom_sections: [{ title: 'Education', content: 'BS CS' }]
        });
        expect(html).toContain('Education');
        expect(html).toContain('BS CS');
    });

    it('includes other sections with subtitle and description', () => {
        const html = buildPrintHtml([], {}, {}, {
            custom_sections: [{ title: 'Awards', subtitle: '2020', description: 'Top performer' }]
        });
        expect(html).toContain('Awards');
        expect(html).toContain('section-sub');
        expect(html).toContain('2020');
        expect(html).toContain('Top performer');
    });

    it('escapes HTML in user content', () => {
        const html = buildPrintHtml([], {}, {}, {
            contact: { name: '<script>alert(1)</script>' }
        });
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>');
    });

    it('handles null/undefined otherSections', () => {
        const html = buildPrintHtml([], {}, {}, null);
        expect(html).toMatch(/^<!DOCTYPE html>/);
    });

    it('linkifies URLs in content', () => {
        const html = buildPrintHtml([], {}, {}, {
            custom_sections: [{ title: 'Links', content: 'See https://example.com' }]
        });
        expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });
});
