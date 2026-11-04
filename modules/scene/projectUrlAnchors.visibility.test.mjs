/**
 * GitHub / GitHub Pages anchors must be readable and hittable on the card,
 * not merely present in the HTML string.
 *
 * happy-dom checks the real stylesheets (contrast, pointer events, focus, text selection).
 * When Chrome is installed, a headless pass also checks layout: non-zero boxes and
 * elementFromPoint landing on the link rather than the close button.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createJobsDependencyStub } from '@/modules/resume/testFixtures.mjs'
import { renderBizCardSceneBodyHtml } from './cardMarkup.mjs'
import { installCardStyles } from './cardVisualEquivalency.mjs'
import { parseCssColorToRgb } from '@/modules/utils/colorUtils.mjs'

const jobsDep = createJobsDependencyStub()
const applyPaletteToElement = vi.fn(async () => {})

vi.mock('@/modules/composables/useJobsDependency.mjs', () => ({
    getGlobalJobsDependency: () => jobsDep,
    useJobsDependency: () => jobsDep,
}))
vi.mock('@/modules/composables/useColorPalette.mjs', () => ({
    applyPaletteToElement,
    applyPaletteToElementSync: vi.fn(() => {}),
    syncSkillCardBackLinkPresentation: vi.fn(() => {}),
}))
vi.mock('@/modules/utils/selectionPersistence.mjs', () => ({
    persistSelectedCard: vi.fn(async () => {}),
    readPersistedSelectedCard: vi.fn(() => null),
}))

const { resumeItemsController: ric } = await import('@/modules/resume/ResumeItemsController.mjs')
const { selectionManager } = await import('@/modules/core/selectionManager.mjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sceneCss = readFileSync(path.resolve(__dirname, '../../styles/scene.css'), 'utf8')
const resumeVue = readFileSync(path.resolve(__dirname, '../components/ResumeContainer.vue'), 'utf8')
const unscopedStart = resumeVue.lastIndexOf('\n<style>\n')
if (unscopedStart < 0) throw new Error('ResumeContainer.vue unscoped <style> block not found')
const unscopedCss = resumeVue.slice(unscopedStart + '\n<style>\n'.length, resumeVue.indexOf('</style>', unscopedStart))

const DESCRIPTION = '• React app generating color palettes. (github.com/sbecker11/color-palette-maker) (sbecker11.github.io/color-palette-maker/)'

const DARK = {
    bg: '#14141f',
    fg: '#ffffff',
    selectedBg: '#101018',
    selectedFg: '#ffffff',
}
const LIGHT = {
    bg: '#f7f4ee',
    fg: '#111111',
    selectedBg: '#fff8e8',
    selectedFg: '#111111',
}

function relativeLuminance(rgb) {
    const lin = (c) => {
        const s = c / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

function contrastRatio(a, b) {
    const L1 = relativeLuminance(a)
    const L2 = relativeLuminance(b)
    const lighter = Math.max(L1, L2)
    const darker = Math.min(L1, L2)
    return (lighter + 0.05) / (darker + 0.05)
}

function paintCard(el, theme) {
    el.style.setProperty('--data-background-color', theme.bg)
    el.style.setProperty('--data-foreground-color', theme.fg)
    el.style.setProperty('--data-link-color', theme.fg)
    el.style.setProperty('--data-background-color-selected', theme.selectedBg)
    el.style.setProperty('--data-foreground-color-selected', theme.selectedFg)
    el.style.setProperty('--data-link-color-selected', theme.selectedFg)
    el.style.setProperty('--data-background-color-hovered', theme.bg)
    el.style.setProperty('--data-foreground-color-hovered', theme.fg)
    el.style.setProperty('--data-link-color-hovered', theme.fg)
    el.style.setProperty('--data-normal-padding', '12px')
    el.style.setProperty('--data-normal-inner-border-width', '1px')
    el.style.setProperty('--data-normal-border-radius', '25px')
}

function opaqueBackground(el) {
    let node = el
    while (node) {
        const rgb = parseCssColorToRgb(getComputedStyle(node).backgroundColor)
        if (rgb) {
            const alpha = /rgba\(/.test(getComputedStyle(node).backgroundColor)
                ? Number(getComputedStyle(node).backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? 1)
                : 1
            if (alpha > 0.05) return rgb
        }
        node = node.parentElement
    }
    return null
}

/**
 * @param {HTMLAnchorElement} link
 * @param {string} label
 */
function assertLinkVisibleAndSelectable(link, label) {
    expect(link, label).toBeTruthy()
    expect(link.textContent, label).toBeTruthy()
    expect(link.getAttribute('href'), `${label} href`).toMatch(/^https:\/\//)
    expect(link.target, label).toBe('_blank')

    const cs = getComputedStyle(link)
    expect(cs.display, `${label} display`).not.toBe('none')
    expect(cs.visibility, `${label} visibility`).not.toBe('hidden')
    // happy-dom leaves the initial opacity as an empty string. Blank means the CSS initial value, 1.
    const opacity = cs.opacity === '' || cs.opacity == null ? 1 : Number.parseFloat(cs.opacity)
    expect(opacity, `${label} opacity "${cs.opacity}"`).toBeGreaterThan(0.85)
    expect(cs.pointerEvents, `${label} pointer-events`).not.toBe('none')
    expect(cs.userSelect === 'none' ? cs.webkitUserSelect : cs.userSelect, `${label} user-select`).not.toBe('none')
    expect(cs.textDecorationLine || cs.textDecoration, `${label} underline`).toMatch(/underline/)
    expect(Number.parseFloat(cs.fontSize), `${label} font-size`).toBeGreaterThanOrEqual(14)

    const fg = parseCssColorToRgb(cs.color)
    const bg = opaqueBackground(link)
    expect(fg, `${label} computed color ${cs.color}`).toBeTruthy()
    expect(bg, `${label} opaque background`).toBeTruthy()
    const ratio = contrastRatio(fg, bg)
    expect(ratio, `${label} contrast ${cs.color} on ${JSON.stringify(bg)}`).toBeGreaterThanOrEqual(4.5)

    link.focus()
    expect(document.activeElement, `${label} focus`).toBe(link)

    const selection = window.getSelection()
    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(link)
    selection.addRange(range)
    expect(selection.toString(), `${label} text selection`).toBe(link.textContent)
}

function buildResumeCard(theme, { selected = false } = {}) {
    jobsDep.setJobs([{
        employer: 'color-palette-maker',
        role: 'Portfolio Project: color-palette-maker',
        start: '04/2025',
        end: '05/2026',
        Description: DESCRIPTION,
        skillIDs: [],
    }])
    const card = document.createElement('div')
    card.className = selected ? 'biz-resume-div selected' : 'biz-resume-div'
    card.id = 'resume-0'
    card.setAttribute('data-job-number', '0')
    card.style.width = '480px'
    card.style.position = 'relative'
    paintCard(card, theme)
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'r-div-close'
    close.textContent = '×'
    card.appendChild(close)
    card.appendChild(ric.createEnhancedResumeDetailsDiv(0))
    return card
}

function buildSceneCard(theme, { selected = false } = {}) {
    const card = document.createElement('div')
    card.className = selected ? 'biz-card-div clone' : 'biz-card-div'
    card.style.width = '480px'
    card.style.position = 'relative'
    paintCard(card, theme)
    card.innerHTML = renderBizCardSceneBodyHtml({
        employer: 'color-palette-maker',
        role: 'Portfolio Project: color-palette-maker',
        datesDisplay: 'Apr 2025 - May 2026',
        description: DESCRIPTION,
    })
    return card
}

function findChrome() {
    const candidates = [
        process.env.CHROME_BIN,
        '/opt/google/chrome/chrome',
        '/usr/bin/chromium',
        'chromium',
        'chromium-browser',
    ].filter(Boolean)
    for (const bin of candidates) {
        const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' })
        if (probe.status === 0) return bin
    }
    return null
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    document.body.innerHTML = ''
    installCardStyles(sceneCss, unscopedCss)
    selectionManager.selectedCard = null
    selectionManager.selectedJobNumber = null
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('project url anchors are visible and selectable', () => {
    it('keeps GitHub and GitHub Pages readable, focusable, and selectable on dark and light cards', () => {
        const listing = document.createElement('div')
        listing.id = 'resume-content-listing'
        listing.style.width = '520px'
        document.body.appendChild(listing)
        const cases = [
            ['resume selected dark', buildResumeCard(DARK, { selected: true })],
            ['resume light', buildResumeCard(LIGHT, { selected: false })],
            ['scene selected dark', buildSceneCard(DARK, { selected: true })],
            ['scene light', buildSceneCard(LIGHT, { selected: false })],
        ]
        for (const [label, card] of cases) {
            listing.appendChild(card)
            const links = [...card.querySelectorAll('a.project-url-anchor')]
            expect(links.map((a) => a.textContent), label).toEqual(['GitHub', 'GitHub Pages'])
            for (const link of links) assertLinkVisibleAndSelectable(link, `${label} ${link.textContent}`)
        }
    })

    it('does not clear the open card when the GitHub anchor is clicked', () => {
        const card = buildResumeCard(DARK, { selected: true })
        document.body.appendChild(card)
        selectionManager.selectedJobNumber = 0
        const link = card.querySelector('a.project-url-anchor')
        let activated = false
        link.addEventListener('click', () => { activated = true })
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        ric.handleBizResumeDivClickEvent(card, { target: link, stopPropagation() {} })
        expect(activated).toBe(true)
        expect(selectionManager.selectedJobNumber).toBe(0)
    })

    const chromeBin = findChrome()
    it.skipIf(!chromeBin)('headless Chrome: each anchor has a box and is the top hit target', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'anchor-vis-'))
        const profileDir = path.join(dir, 'chrome-profile')
        const cssPath = path.join(dir, 'card.css')
        const htmlPath = path.join(dir, 'card.html')
        writeFileSync(cssPath, `${sceneCss}\n${unscopedCss}`)

        const resume = buildResumeCard(DARK, { selected: true })
        const scene = buildSceneCard(DARK, { selected: true })
        const lightResume = buildResumeCard(LIGHT, { selected: false })
        resume.id = 'dark-resume'
        scene.id = 'dark-scene'
        lightResume.id = 'light-resume'

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${cssPath}">
<style>
  body { margin: 16px; background: #222; }
  #dark-resume, #dark-scene, #light-resume { margin-bottom: 24px; }
</style>
</head>
<body>
<div id="resume-content-listing" style="width:520px">
${resume.outerHTML}
${scene.outerHTML}
${lightResume.outerHTML}
</div>
<pre id="probe-result"></pre>
<script>
function parseRgb(s) {
  const m = String(s).match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function lum(rgb) {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function bgOf(el) {
  let n = el;
  while (n) {
    const rgb = parseRgb(getComputedStyle(n).backgroundColor);
    if (rgb && rgb.a > 0.05) return rgb;
    n = n.parentElement;
  }
  return null;
}
const out = [];
for (const card of document.querySelectorAll('#dark-resume, #dark-scene, #light-resume')) {
  for (const link of card.querySelectorAll('a.project-url-anchor')) {
    const rect = link.getBoundingClientRect();
    const cs = getComputedStyle(link);
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    link.focus();
    const fg = parseRgb(cs.color);
    const bg = bgOf(link);
    out.push({
      card: card.id,
      text: link.textContent,
      href: link.getAttribute('href'),
      width: rect.width,
      height: rect.height,
      color: cs.color,
      contrast: fg && bg ? contrast(fg, bg) : 0,
      hitText: hit && (hit === link || link.contains(hit)) ? link.textContent : (hit ? hit.className || hit.tagName : null),
      focused: document.activeElement === link,
      pointerEvents: cs.pointerEvents,
      visibility: cs.visibility,
      display: cs.display,
      opacity: cs.opacity,
      userSelect: cs.userSelect,
    });
  }
}
document.getElementById('probe-result').textContent = JSON.stringify(out);
</script>
</body>
</html>`
        writeFileSync(htmlPath, html)

        const probe = spawnSync(chromeBin, [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            `--user-data-dir=${profileDir}`,
            '--window-size=900,800',
            '--virtual-time-budget=4000',
            '--dump-dom',
            htmlPath,
        ], { encoding: 'utf8', timeout: 15000 })
        expect(probe.status, probe.stderr).toBe(0)
        const match = probe.stdout.match(/<pre id="probe-result">([^<]*)<\/pre>/)
        expect(match, probe.stdout.slice(0, 500)).toBeTruthy()
        const rows = JSON.parse(match[1])
        expect(rows).toHaveLength(6)
        for (const row of rows) {
            expect(row.width, JSON.stringify(row)).toBeGreaterThan(40)
            expect(row.height, JSON.stringify(row)).toBeGreaterThan(12)
            expect(row.contrast, JSON.stringify(row)).toBeGreaterThanOrEqual(4.5)
            expect(row.hitText, JSON.stringify(row)).toBe(row.text)
            expect(row.focused, JSON.stringify(row)).toBe(true)
            expect(row.pointerEvents, JSON.stringify(row)).not.toBe('none')
            expect(row.visibility, JSON.stringify(row)).toBe('visible')
            expect(row.display, JSON.stringify(row)).not.toBe('none')
            expect(Number(row.opacity), JSON.stringify(row)).toBeGreaterThan(0.85)
            expect(row.userSelect, JSON.stringify(row)).not.toBe('none')
            expect(row.href, JSON.stringify(row)).toMatch(/^https:\/\//)
        }
    }, 25000)
})
