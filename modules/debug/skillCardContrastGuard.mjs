/**
 * Dev / opt-in guard: after palette, Z-filter, or class changes, verify skill rows
 * use a single contrast decision (icon variant vs foreground luminance vs icon filter).
 *
 * Enable: import.meta.env.DEV, or URL ?debugSkillContrast=1
 */

import { reportError } from '@/modules/utils/errorReporting.mjs';

const LOG_PREFIX = '[SkillCardContrastGuard]';

/** WCAG relative luminance 0–1 */
function relativeLuminance(r, g, b) {
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Parse browser computed `color` (rgb/rgba). */
function parseComputedRgb(color) {
  if (!color || color === 'transparent') return null;
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function isRoughlyVisible(el) {
  if (!el?.isConnected) return false;
  const r = el.getClientRects();
  if (!r?.length) return false;
  const st = getComputedStyle(el);
  if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return false;
  return true;
}

/**
 * Which icon-variant attribute applies for this element + class state.
 * @returns {{ attr: string, stateLabel: string, foregroundProp: string } | null}
 */
function contrastStateForElement(el) {
  if (el.classList.contains('skill-card-div')) {
    if (el.classList.contains('clone')) {
      return {
        attr: 'data-icon-set-selected-variant',
        stateLabel: 'scene-clone-selected',
        foregroundProp: '--data-foreground-color-selected',
      };
    }
    if (el.classList.contains('hovered')) {
      return {
        attr: 'data-icon-set-hovered-variant',
        stateLabel: 'scene-hovered',
        foregroundProp: '--data-foreground-color-hovered',
      };
    }
    return {
      attr: 'data-icon-set-variant',
      stateLabel: 'scene-normal',
      foregroundProp: '--data-foreground-color',
    };
  }
  if (el.classList.contains('skill-resume-div')) {
    if (el.classList.contains('selected')) {
      return {
        attr: 'data-icon-set-selected-variant',
        stateLabel: 'resume-selected',
        foregroundProp: '--data-foreground-color-selected',
      };
    }
    if (el.classList.contains('hovered')) {
      return {
        attr: 'data-icon-set-hovered-variant',
        stateLabel: 'resume-hovered',
        foregroundProp: '--data-foreground-color-hovered',
      };
    }
    return {
      attr: 'data-icon-set-variant',
      stateLabel: 'resume-normal',
      foregroundProp: '--data-foreground-color',
    };
  }
  return null;
}

/**
 * palette-utils: variant `white` => light text (#fff); `black` => dark text (#000).
 */
function textMatchesVariant(lum, variant) {
  if (variant === 'white') return lum >= 0.55;
  if (variant === 'black') return lum <= 0.45;
  return true;
}

function iconFilterMatchesVariant(icon, variant) {
  if (!icon) return true;
  const f = (getComputedStyle(icon).filter || '').toLowerCase();
  const inverted = f.includes('invert');
  if (variant === 'white') return inverted;
  if (variant === 'black') return !inverted;
  return true;
}

function describeElement(el) {
  const id = el.id ? `#${el.id}` : '';
  const name = el.getAttribute('data-skill-name') || el.getAttribute('data-skill-card-id') || '';
  return `${el.className}${id}${name ? ` name=${JSON.stringify(name)}` : ''}`;
}

/** Inline palette vars are authoritative; getComputedStyle().color can lie mid-transition (see scene.css transition on color). */
function parseHexFromInlineVar(el, prop) {
  const raw = el.style.getPropertyValue(prop).trim().toLowerCase();
  if (!raw) return null;
  const hex7 = raw.match(/^#([0-9a-f]{6})$/);
  if (hex7) {
    const h = hex7[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      source: raw,
    };
  }
  const rgb = parseComputedRgb(raw);
  if (rgb) return { ...rgb, source: raw };
  return null;
}

/** @type {Map<string, string>} */
let lastWarnByKey = new Map();

function checkElement(el, report) {
  const state = contrastStateForElement(el);
  if (!state) return;

  const variant = (el.getAttribute(state.attr) || '').trim().toLowerCase();
  if (variant !== 'white' && variant !== 'black') return;

  const fg = parseHexFromInlineVar(el, state.foregroundProp);
  let textOk = true;
  let fgNote = 'inline-var-missing';
  if (fg) {
    const lum = relativeLuminance(fg.r, fg.g, fg.b);
    textOk = textMatchesVariant(lum, variant);
    fgNote = `${state.foregroundProp}=${fg.source} lum≈${lum.toFixed(3)}`;
  }

  const icon = el.querySelector('.back-icon, .url-icon, .img-icon');
  const iconOk = iconFilterMatchesVariant(icon, variant);

  const key = el.id || describeElement(el);
  if (textOk && iconOk) {
    lastWarnByKey.delete(key);
    return;
  }

  const msg = [
    `Contrast mismatch on ${describeElement(el)}`,
    `state=${state.stateLabel}`,
    `attr=${state.attr}=${variant}`,
    fgNote,
    `textOk=${textOk}`,
    `iconOk=${iconOk}`,
    icon ? `iconFilter=${getComputedStyle(icon).filter || 'none'}` : 'no-icon',
  ].join(' | ');

  if (lastWarnByKey.get(key) === msg) return;
  lastWarnByKey.set(key, msg);
  report(msg);
}

function collectRoots() {
  const scenePlane = document.querySelector('#scene-plane');
  const resume = document.querySelector('#resume-container');
  const app = document.getElementById('app-container');
  const list = [];
  if (scenePlane) list.push(scenePlane);
  if (resume) list.push(resume);
  if (list.length === 0 && app) list.push(app);
  return list;
}

function querySkillElements(roots) {
  const set = new Set();
  const sel = '.skill-card-div, .skill-resume-div';
  for (const root of roots) {
    root.querySelectorAll(sel).forEach((el) => set.add(el));
  }
  return [...set];
}

/**
 * @returns {() => void} teardown
 */
export function installSkillCardContrastGuard(options = {}) {
  const enabled =
    options.enabled ??
    (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugSkillContrast') === '1'));

  if (!enabled) {
    return () => {};
  }

  let raf = 0;
  const roots = options.roots?.length ? options.roots : collectRoots();

  const run = () => {
    raf = 0;
    try {
      const activeRoots = roots.filter((r) => r.isConnected);
      const els = querySkillElements(activeRoots.length ? activeRoots : collectRoots());
      const seen = new Set();
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!isRoughlyVisible(el)) continue;
        checkElement(el, (msg) => {
          console.warn(`${LOG_PREFIX} ${msg}`);
        });
      }
    } catch (e) {
      reportError(e, '[SkillCardContrastGuard] run failed', null);
      /* Diagnostic only — do not break the app */
    }
  };

  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  };

  const obs = new MutationObserver(schedule);
  const observeRoot = (root) => {
    if (!root) return;
    obs.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      /* Omit `style`: parallax sets transform every frame and would spam checks; rendering-changed still refreshes contrast. */
      attributeFilter: [
        'class',
        'data-icon-set-variant',
        'data-icon-set-hovered-variant',
        'data-icon-set-selected-variant',
        'data-background-color',
        'data-background-color-selected',
        'data-background-color-hovered',
      ],
    });
  };

  for (const r of roots) observeRoot(r);

  const onRenderingChanged = () => schedule();
  window.addEventListener('rendering-changed', onRenderingChanged);

  schedule();

  return () => {
    window.removeEventListener('rendering-changed', onRenderingChanged);
    obs.disconnect();
    if (raf) cancelAnimationFrame(raf);
  };
}
