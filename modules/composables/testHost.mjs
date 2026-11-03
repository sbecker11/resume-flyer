/**
 * Test-only host for running composables inside a real Vue component instance
 * (so provide/inject, onMounted and onUnmounted behave as in the app).
 * Not imported by app code; excluded from coverage in vitest.config.js.
 */
import { createApp, defineComponent, h } from 'vue';

/**
 * Mount a throwaway component whose setup() runs `setup`. Returns the composable's
 * result plus an unmount() that triggers onUnmounted hooks and removes the host node.
 * `provide()` is only visible to descendants, so anything the composable injects must be
 * provided from `options.parentSetup`, which runs in a wrapping parent component.
 * @template T, P
 * @param {() => T} setup  runs inside the child component's setup()
 * @param {{ parentSetup?: () => P, configureApp?: (app: import('vue').App) => void }} [options]
 * @returns {{ result: T, parent: P, app: import('vue').App, host: HTMLElement, unmount: () => void }}
 */
export function withSetup(setup, options = {}) {
    let result;
    let parent;
    const Child = defineComponent({
        name: 'ComposableTestHost',
        setup() {
            result = setup();
            return () => h('div', { class: 'composable-test-host' });
        },
    });
    const Parent = defineComponent({
        name: 'ComposableTestProvider',
        setup() {
            parent = options.parentSetup?.();
            return () => h(Child);
        },
    });
    const app = createApp(Parent);
    app.config.warnHandler = () => {};
    options.configureApp?.(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    return {
        result,
        parent,
        app,
        host,
        unmount() {
            app.unmount();
            host.remove();
        },
    };
}

/** Pin an element's layout box; happy-dom reports zeros otherwise. */
export function setRect(el, { left = 0, top = 0, width = 0, height = 0 }) {
    el.getBoundingClientRect = () => ({
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON() { return this; },
    });
    return el;
}
