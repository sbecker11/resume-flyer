import { ref, onMounted, onUnmounted } from 'vue'
import { useViewport } from './useViewport.mjs'
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs'

export function useSceneViewLabel() {
    const sceneViewLabelElement = ref(null)
    const isInitialized = ref(false)
    const { viewport } = useViewport()
    const elementRegistry = injectGlobalElementRegistry()

    function getResizeHandlePosition() {
        // Find the resize handle element using optimized registry
        const resizeHandleElement = elementRegistry.getResizeHandle()
        if (!resizeHandleElement) {
            console.log('Resize handle element not found')
            return null
        }
        
        // Get the bounding rectangle of the resize handle
        const rect = resizeHandleElement.getBoundingClientRect()
        
        // Return the left edge position
        return {
            left: rect.left
        }
    }

    function repositionLabel() {
        if (!sceneViewLabelElement.value) {
            console.log('SceneViewLabel: element not found')
            return
        }

        // Get the resize handle position
        const resizeHandlePos = getResizeHandlePosition()
        
        if (resizeHandlePos) {
            // Position the label at the bottom right of the scene container
            // Calculate position relative to the scene container
            const sceneContainer = elementRegistry.getSceneContainer()
            if (sceneContainer) {
                const sceneRect = sceneContainer.getBoundingClientRect()
                
                // Position at bottom right of scene container
                const bottom = 15 // 15px from bottom
                const right = 13 // 13px from right edge
                
                // Calculate position relative to viewport
                const top = sceneRect.bottom - bottom - 20 // 20px is approximate text height
                const left = sceneRect.right - right - 120 // 120px is approximate text width
                
                console.log('SceneViewLabel positioning:', { top, left, sceneRect })
                
                // Apply positioning
                sceneViewLabelElement.value.style.top = `${top}px`
                sceneViewLabelElement.value.style.left = `${left}px`
                sceneViewLabelElement.value.style.right = 'auto'
                sceneViewLabelElement.value.style.bottom = 'auto'
            } else {
                console.log('SceneViewLabel: scene container not found')
                // Fallback positioning
                const top = window.innerHeight - 40
                const left = window.innerWidth - 120
                sceneViewLabelElement.value.style.top = `${top}px`
                sceneViewLabelElement.value.style.left = `${left}px`
                sceneViewLabelElement.value.style.right = 'auto'
                sceneViewLabelElement.value.style.bottom = 'auto'
            }
        } else {
            console.log('SceneViewLabel: resize handle not found, using fallback positioning')
            // Fallback to bottom right corner
            const top = window.innerHeight - 40
            const left = window.innerWidth - 120

            sceneViewLabelElement.value.style.top = `${top}px`
            sceneViewLabelElement.value.style.left = `${left}px`
            sceneViewLabelElement.value.style.right = 'auto'
            sceneViewLabelElement.value.style.bottom = 'auto'
        }
    }

    function initialize() {
        if (isInitialized.value) {
            console.log("sceneViewLabel.initialize: already initialized")
            return
        }
        
        sceneViewLabelElement.value = elementRegistry.getElement('scene-view-label', 'scene-view-label')
        if (!sceneViewLabelElement.value) {
            throw new Error("sceneViewLabel.initialize: #scene-view-label element not found in DOM")
        }

        // Listen for layout changes to reposition the label
        window.addEventListener('layout-changed', repositionLabel)
        
        // Listen for viewport changes to reposition the label
        window.addEventListener('viewport-changed', repositionLabel)

        // Initial positioning with a small delay to ensure DOM is ready
        setTimeout(() => {
            repositionLabel()
        }, 100)

        isInitialized.value = true
    }

    function setSceneViewLabel(text) {
        if (sceneViewLabelElement.value) {
            sceneViewLabelElement.value.textContent = text
        }
    }

    // Cleanup event listeners
    function cleanup() {
        window.removeEventListener('layout-changed', repositionLabel)
        window.removeEventListener('viewport-changed', repositionLabel)
        isInitialized.value = false
    }

    onMounted(() => {
        initialize()
    })

    onUnmounted(() => {
        cleanup()
    })

    return {
        sceneViewLabelElement,
        isInitialized,
        repositionLabel,
        setSceneViewLabel,
        initialize,
        cleanup
    }
}