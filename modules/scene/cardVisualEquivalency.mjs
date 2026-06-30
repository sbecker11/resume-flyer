/**
 * Helpers for comparing scene vs resume card computed styles in tests.
 */

/** @typedef {{ fontSize?: string, paddingTop?: string, paddingLeft?: string, fontWeight?: string }} StyleSnapshot */

/**
 * @param {Element | null | undefined} el
 * @param {(keyof CSSStyleDeclaration)[]} props
 * @returns {Record<string, string>}
 */
export function snapshotStyles(el, props) {
    if (!el) throw new Error('snapshotStyles: element is null')
    const cs = getComputedStyle(el)
    /** @type {Record<string, string>} */
    const out = {}
    for (const prop of props) {
        out[prop] = cs[prop]
    }
    return out
}

/**
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
 * @param {string} [label]
 */
export function assertStylesMatch(a, b, label = 'elements') {
    for (const key of Object.keys(a)) {
        if (a[key] !== b[key]) {
            throw new Error(
                `[cardVisualEquivalency] ${label} mismatch on ${key}: scene="${a[key]}" resume="${b[key]}"`
            )
        }
    }
}

/**
 * @param {ParentNode} rootA
 * @param {ParentNode} rootB
 * @param {string} selector
 * @param {(keyof CSSStyleDeclaration)[]} props
 * @param {string} [label]
 */
export function assertSelectorStylesMatch(rootA, rootB, selector, props, label = selector) {
    const elA = rootA.querySelector(selector)
    const elB = rootB.querySelector(selector)
    if (!elA || !elB) {
        throw new Error(`[cardVisualEquivalency] missing ${label}: scene=${!!elA} resume=${!!elB}`)
    }
    assertStylesMatch(snapshotStyles(elA, props), snapshotStyles(elB, props), label)
}

/**
 * Inject scene.css (+ optional overrides) once per document for happy-dom tests.
 * @param {string} sceneCssText
 * @param {string} [extraCss]
 */
export function installCardStyles(sceneCssText, extraCss = '') {
    const id = 'card-visual-equivalency-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `${extraCss}\n${sceneCssText}`
    document.head.appendChild(style)
}

/** Palette vars required for card shell rules in scene.css */
export const CARD_TEST_THEME_VARS = `
:root {
  --data-normal-padding: 8px;
  --data-normal-inner-border-width: 1px;
  --data-normal-inner-border-color: #fff;
  --data-normal-outer-border-width: 0px;
  --data-normal-outer-border-color: transparent;
  --data-normal-border-radius: 25px;
  --data-background-color: #4a5568;
  --data-foreground-color: #fff;
  --data-background-color-selected: #2d3748;
  --data-foreground-color-selected: #fff;
}
`
