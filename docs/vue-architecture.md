# Resume-Flock Vue Architecture

This document breaks the application into 8 logical subsections, each with its own diagram, plus a top-level diagram that ties them all together.

---

## 1. Top-Level Overview

All major systems and how they interconnect.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph Bootstrap["Bootstrap"]
        main["main.ts"]
    end

    subgraph AppShell["App Shell"]
        AppVue["App.vue\n(Root + DI Provider)"]
        AppContent["AppContent.vue\n(Layout Manager)"]
    end

    subgraph Panels["UI Panels"]
        subgraph SceneSys["Scene Viewer"]
            SceneContainer["SceneContainer.vue"]
            ParallaxSys["Parallax System"]
            TimelineSys["Timeline System"]
            CardsSys["Cards System"]
        end
        subgraph ResumeSys["Resume Viewer"]
            ResumeContainer["ResumeContainer.vue"]
            ResumeCtrls["Resume Controllers"]
        end
        subgraph LayoutSys["Layout System"]
            ResizeHandle["ResizeHandle.vue"]
            LayoutToggle["Layout Toggle"]
            Viewport["Viewport"]
        end
    end

    subgraph StateSvc["State & Services"]
        AppStore["appStore"]
        AppState["useAppState"]
        GlobalSvc["globalServices (DI)"]
        SelectionMgr["selectionManager"]
        EventBus["eventBus"]
    end

    subgraph DataLayer["Data Layer"]
        JobsData["enrichedJobs"]
        ResumeMgrAPI["resumeManagerApi"]
        Backend["server.mjs\n(Express API)"]
    end

    classDef bootstrapNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef appNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef sceneNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef resumeNode fill:#7a3b00,stroke:#e67e22,color:#fff
    classDef layoutNode fill:#006666,stroke:#1abc9c,color:#fff
    classDef stateNode fill:#7a1c1c,stroke:#e74c3c,color:#fff
    classDef dataNode fill:#4a4a00,stroke:#f1c40f,color:#fff

    class main bootstrapNode
    class AppVue,AppContent appNode
    class SceneContainer,ParallaxSys,TimelineSys,CardsSys sceneNode
    class ResumeContainer,ResumeCtrls resumeNode
    class ResizeHandle,LayoutToggle,Viewport layoutNode
    class AppStore,AppState,GlobalSvc,SelectionMgr,EventBus stateNode
    class JobsData,ResumeMgrAPI,Backend dataNode

    main --> AppVue
    AppVue --> AppContent
    AppContent --> Panels
    Panels --> StateSvc
    SceneSys --> DataLayer
    ResumeSys --> DataLayer
    DataLayer --> Backend
```

---

## 2. App Bootstrap & Dependency Injection

How the app initializes and wires up services via Vue 3 provide/inject.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph Bootstrap["Bootstrap (main.ts)"]
        createApp["createApp(App)"]
        mount["app.mount('#app')"]
    end

    subgraph DIKeys["globalServices.ts — Injection Keys"]
        BULLS_EYE_KEY["BULLS_EYE_KEY (Symbol)"]
        RLC_KEY["RESUME_LIST_CTRL_KEY (Symbol)"]
        FOCAL_PT_KEY["FOCAL_POINT_KEY (Symbol)"]
        APP_STATE_KEY["APP_STATE_KEY (Symbol)"]
    end

    subgraph Provider["App.vue — Provider"]
        AppVue["App.vue\n(root component)"]
        p1["provide(BULLS_EYE_KEY, bullsEye)"]
        p2["provide(RESUME_LIST_CTRL_KEY, rlc)"]
        p3["provide(FOCAL_POINT_KEY, focalPoint)"]
        p4["provide(APP_STATE_KEY, appState)"]
    end

    subgraph Consumers["Consumer Composables (globalServices.ts)"]
        useBullsEye["useBullsEyeService()"]
        useRLC["useResumeListController()"]
        useFP["useFocalPointService()"]
        useAppCtx["useAppContext()"]
    end

    subgraph Components["Consuming Components"]
        ResizeHandleVue["ResizeHandle.vue"]
        ResumeContainerVue["ResumeContainer.vue"]
        useFocalPt["useFocalPointVue3.mjs"]
        useParallax["useParallaxVue3Enhanced.mjs"]
    end

    classDef bootstrapNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef keyNode fill:#4a4a00,stroke:#f1c40f,color:#fff
    classDef providerNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef consumerNode fill:#006666,stroke:#1abc9c,color:#fff
    classDef componentNode fill:#5a2d82,stroke:#9b59b6,color:#fff

    class createApp,mount bootstrapNode
    class BULLS_EYE_KEY,RLC_KEY,FOCAL_PT_KEY,APP_STATE_KEY keyNode
    class AppVue,p1,p2,p3,p4 providerNode
    class useBullsEye,useRLC,useFP,useAppCtx consumerNode
    class ResizeHandleVue,ResumeContainerVue,useFocalPt,useParallax componentNode

    createApp --> mount
    mount --> AppVue
    DIKeys --> Provider
    AppVue --> p1 & p2 & p3 & p4
    p1 --> useBullsEye
    p2 --> useRLC
    p3 --> useFP
    p4 --> useAppCtx
    useBullsEye --> ResizeHandleVue
    useRLC --> ResumeContainerVue
    useFP --> useFocalPt
    useBullsEye --> useParallax
```

---

## 3. Vue Component Tree

Parent-child relationships between all Vue components.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    App["App.vue"] --> AppContent["AppContent.vue\n(Layout Manager)"]

    AppContent --> SceneContainer["SceneContainer.vue\n(Left panel)"]
    AppContent --> ResizeHandle["ResizeHandle.vue\n(Draggable divider)"]
    AppContent --> ResumeContainer["ResumeContainer.vue\n(Right panel)"]
    AppContent --> ResumeManager["ResumeManager.vue\n(File picker modal)"]
    AppContent --> ColorPaletteSelector["ColorPaletteSelector.vue\n(Theme picker)"]

    SceneContainer --> Timeline["Timeline.vue\n(SVG year/month ticks)"]
    SceneContainer --> SceneContainerFooter["SceneContainerFooter.vue\n(Controls bar)"]
    SceneContainer --> SceneViewLabel["SceneViewLabel.vue\n(% width label)"]

    ResumeContainer --> ResumeContainerFooter["ResumeContainerFooter.vue\n(Controls bar)"]

    classDef rootNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef shellNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef sceneNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef resumeNode fill:#7a3b00,stroke:#e67e22,color:#fff
    classDef sharedNode fill:#006666,stroke:#1abc9c,color:#fff
    classDef footerNode fill:#4a4a00,stroke:#f1c40f,color:#fff

    class App rootNode
    class AppContent shellNode
    class SceneContainer,Timeline sceneNode
    class ResumeContainer resumeNode
    class ResizeHandle,ResumeManager,ColorPaletteSelector sharedNode
    class SceneContainerFooter,SceneViewLabel,ResumeContainerFooter footerNode
```

---

## 4. State Management & Services

How state is stored, shared, and synchronized across the app.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph Disk["Persistent Storage"]
        StateFile["appState.json\n(disk)"]
    end

    subgraph Persistence["Persistent State Layer"]
        AppState["useAppState.ts\n(TypeScript composable)"]
        StateManager["stateManager.mjs\n(Legacy migration)"]
    end

    subgraph Reactive["Reactive Store"]
        AppStore["appStore.mjs\n(Pinia-like store)"]
        subgraph Computed["Computed Properties"]
            computed1["scenePercentage"]
            computed2["layoutOrientation"]
            computed3["colorPalette"]
        end
    end

    subgraph SideEffects["Selection & Events"]
        subgraph Selection["Selection & Hover"]
            SelectionMgr["selectionManager.mjs\nhoveredJobNumber\nselectedJobNumber"]
            Persist["useSelectedElementIdPersistence"]
        end
        subgraph Events["Event Bus"]
            EventBus["eventBus.mjs\nhoverChanged\nselectionChanged\nbulls-eye-moved\nresize-handle-changed"]
        end
    end

    classDef diskNode fill:#333,stroke:#aaa,color:#fff
    classDef persistNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef reactiveNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef selectionNode fill:#7a3b00,stroke:#e67e22,color:#fff
    classDef eventNode fill:#7a1c1c,stroke:#e74c3c,color:#fff

    class StateFile diskNode
    class AppState,StateManager persistNode
    class AppStore,computed1,computed2,computed3 reactiveNode
    class SelectionMgr,Persist selectionNode
    class EventBus eventNode

    StateFile <-->|read/write| AppState
    AppState --> StateManager
    AppState -->|initializes| AppStore
    AppStore --> computed1
    AppStore --> computed2
    AppStore --> computed3
    SelectionMgr -->|dispatches| EventBus
    AppStore -->|triggers| EventBus
    EventBus -->|notifies| SelectionMgr
    SelectionMgr --> Persist
    Persist --> AppState
```

### Application vs content (separation)

Application state and content were not cleanly separated in the original design. The following separation is now explicit:

| | **Application** | **Content** |
|---|-----------------|-------------|
| **Stored** | `app_state.json` only | Loaded/reloaded in memory; not persisted as content |
| **Scope** | App shell, layout, and user choices | The resume’s data and the DOM built from it |
| **Examples** | bullsEye, focalPoint, resumeListing, colorPalette, timeline, resizeHandle and their parent elements; `currentResumeId`, `selectedJobNumber`, layout split, theme | `window.resumeFlock.allDivs`: bizCardDivs, skillCardDivs, bizResumeDivs, skillResumeDivs |
| **Lifecycle** | Persisted across sessions; survives reload | Built when a resume is loaded (initial or manager load); replaced when the resume changes |

Application = *how* the app is set up and what the user has selected. Content = *what* is shown for the current resume (jobs, cards, list items). Content is derived from the resume payload and from `allDivs`; the raw content is not stored in `app_state.json`.

**Content updates app elements (not saved in app_state):** After a new resume is loaded, some app elements must be updated so they cover only the extent of the resume data — e.g. timeline start/end and height, scene view container height (`useTimeline` / `computeBoundsFromJobs`, etc.). Those content-derived bounds are used only to update layout in memory; they are not persisted in `app_state.json`. Card geometry (positions, sizes) is never persisted anywhere: cards are positioned randomly on each resume load.

### Audit: what lives in app_state.json

A pass over the codebase confirms the following:

| What is persisted | Where | Classification |
|-------------------|--------|----------------|
| `currentResumeId`, `selectedJobNumber`, `selectedElementId`, `selectedDualElementId`, `lastVisitedJobNumber` | user-settings | **Application** — selection and which resume is active |
| `layout` (orientation, scenePercentage), `resizeHandle.stepCount`, `focalPoint` (mode/position) | user-settings | **Application** — layout and shell preferences |
| `theme` (colorPalette, borderSettings, etc.) | user-settings | **Application** — visual preferences |
| `resume.sortRule` | user-settings / legacy AppState.resume | **Application** — list sort preference |
| `scrollPositions` (sceneContentScrollTop, resumeContentScrollTop) | user-settings | **Application (view/session)** — scroll position of panels; acceptable as session state |
| `system-constants` (zIndex, cards, timeline, etc.) | system-constants | **Application** — app configuration |

**Not in app_state (correct):** Job data, bizCardDivs, skillCardDivs, bizResumeDivs, skillResumeDivs, any div references or payloads. These live in memory and in `window.resumeFlock.allDivs` and are loaded/reloaded with the resume.

**In-memory only (content-related, not persisted):** `removedJobNumbers` / `dismissedJobNumbers` (which jobs the user hid from the listing via the red X) live only on the controllers and are reset when the resume changes. If we ever persist “hidden jobs” per resume, that should be a per-resume content preference (e.g. alongside the resume or a separate content-level store), not in `app_state.json`.

**Note:** Selection and sort are still written via both the legacy `stateManager` (`AppState`, `saveState`) and the Vue `useAppState` path. Both write to the same backend (`/api/state`). Unifying on a single persistence path is a separate cleanup.

### How hard is it to implement this separation?

**Already in place:** Content is not persisted in app_state. Job data and divs live in memory and in `window.resumeFlock.allDivs`; timeline/scene bounds and card geometry are computed per load and not saved. So the separation (content vs app state) is largely implemented.

**Remaining work (optional / cleanup):**

| Task | Effort | What |
|------|--------|------|
| Unify persistence to one path | **Medium** | Migrate `selectionManager` and `ResumeListController` off legacy `AppState` / `saveState` so only `useAppState` (and its shape) writes to `/api/state`. Requires passing an update/save callback into the managers or loading them with the same state source. |
| Single source of truth for loaded state | **Low–medium** | Have app load state once (e.g. via `useAppState`) and feed `selectedJobNumber`, `resume.sortRule` etc. into legacy code, instead of legacy and Vue both reading/writing. |
| Stop persisting scroll positions | **Low** | If you want app_state to be strictly “user preferences” only, stop writing `scrollPositions`; keep them in memory for the session. |
| Audit that no content is ever written | **Low** | Grep for any `saveState`/`updateAppState` that could write job data, div refs, or content-derived bounds; add a short comment or guard where state is merged. |

**Summary:** The separation is already enforced in practice (no content in app_state). Making it strict and removing the dual persistence path is medium effort; the rest is low-effort polish.

---

## 5. Scene Viewer System

The parallax card scene: bulls-eye, focal point, parallax transforms, and timeline.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph BullsEyeSys["Bulls-Eye System"]
        BullsEye["useBullsEyeVue3.mjs\n(Marks scene center)"]
        BEEvent["bulls-eye-moved\n(custom event)"]
        BERecenter["recenter()\n(called on resize)"]
    end

    subgraph FocalPtSys["Focal Point System"]
        FocalPt["useFocalPointVue3.mjs"]
        FPLocked["🔒 Locked\n(follows bulls-eye)"]
        FPFollowing["👁 Following\n(follows mouse)"]
        FPDragging["✋ Dragging\n(user drags)"]
        CycleMode["cycleMode()\n(tri-state toggle)"]
    end

    subgraph ParallaxSys["Parallax System"]
        Parallax["useParallaxVue3Enhanced.mjs"]
        ZDepth["bizCardUtils.mjs\n(z-depth per card)"]
        ZUtils["zUtils.mjs\n(z-depth)"]
        Transform["CSS transform:\ntranslateX/Y per card"]
    end

    subgraph CardsSys["Cards System"]
        Cards["useCardsController.mjs\n(Creates c-div elements)"]
        BizCards["biz-card-div\n(DOM elements)"]
        BizDetails["bizDetailsDivModule.mjs\n(Card content rendering)"]
    end

    subgraph TimelineSys["Timeline System"]
        Timeline["useTimeline.mjs\n(Generates tick data)"]
        TimelineVue["Timeline.vue\n(SVG rendering)"]
        DateRange["startDate → endDate\n(from enrichedJobs)"]
    end

    classDef bullsNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef focalNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef parallaxNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef cardNode fill:#7a3b00,stroke:#e67e22,color:#fff
    classDef timelineNode fill:#006666,stroke:#1abc9c,color:#fff

    class BullsEye,BEEvent,BERecenter bullsNode
    class FocalPt,FPLocked,FPFollowing,FPDragging,CycleMode focalNode
    class Parallax,ZDepth,ZUtils,Transform parallaxNode
    class Cards,BizCards,BizDetails cardNode
    class Timeline,TimelineVue,DateRange timelineNode

    BullsEye -->|dispatches| BEEvent
    BEEvent -->|when locked| FocalPt
    BERecenter --> BullsEye
    FocalPt --> FPLocked & FPFollowing & FPDragging
    CycleMode --> FocalPt
    FocalPt -->|focal position| Parallax
    BullsEye -->|scene center| Parallax
    Parallax --> ZDepth --> ZUtils --> Transform
    Transform -->|applied to| BizCards
    Cards --> BizCards
    Cards --> BizDetails
    Timeline --> DateRange
    Timeline --> TimelineVue
```

---

## 6. Resume Viewer System

Resume list rendering, infinite scrolling, navigation, and legacy controller integration.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph VueSide["Vue 3 Layer"]
        ResumeContainer["ResumeContainer.vue\n(UI shell)"]
        useRLC["useResumeListController()\n(provide/inject wrapper)"]
        useKeyNav["useKeyboardNavigation.mjs\n(↑↓ arrows, context-aware)"]
    end

    subgraph Bridge["Integration Bridge"]
        Initializer["resumeSystemInitializer.mjs\n(Bootstraps controllers,\nexposes as window globals)"]
        Reinit["resumeReinitializer.mjs\n(Re-init after resize)"]
    end

    subgraph LegacyCtrls["Legacy Controllers"]
        subgraph ListCtrl["ResumeListController.mjs"]
            RLC["List navigation & sorting"]
            SortedIndices["sortedIndices[]\n(position → jobNumber)"]
            GoNextPrev["goToNext() / goToPrevious()"]
            SortRule["currentSortRule\n{ field, direction }"]
        end
        subgraph ItemsCtrl["ResumeItemsController.mjs"]
            RIC["Item creation & positioning"]
            rDivs["r-div elements"]
        end
    end

    classDef vueNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef bridgeNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef listNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef itemNode fill:#7a3b00,stroke:#e67e22,color:#fff

    class ResumeContainer,useRLC,useKeyNav vueNode
    class Initializer,Reinit bridgeNode
    class RLC,SortedIndices,GoNextPrev,SortRule listNode
    class RIC,rDivs itemNode

    ResumeContainer --> useRLC
    useRLC -->|inject| Initializer
    useKeyNav -->|calls| RLC
    Initializer --> LegacyCtrls
    RLC --> SortedIndices
    RLC --> GoNextPrev
    RLC --> SortRule
    RIC --> rDivs
```

---

## 7. Data Pipeline

How resume data flows from source files through enrichment to UI consumers.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    ParsedFiles["*.parsed.mjs"]
    Adapter["parsedResumeAdapter.mjs"]
    ExportParser["parseMjsExport.mjs"]
    Enriched["enrichedJobs.mjs"]
    JobsDep["useJobsDependency.mjs"]

    subgraph BackendAPI["Backend API"]
        Server["server.mjs"]
        Endpoints["/api/resumes\n/api/state\n/api/content"]
        APIClient["resumeManagerApi.mjs"]
    end

    subgraph UIConsumers["UI Consumers"]
        Cards["useCardsController → c-divs"]
        Timeline["useTimeline → SVG"]
        ResumeItems["ResumeItemsController → r-divs"]
        ResumeMgrUI["ResumeManager.vue"]
    end

    classDef sourceNode fill:#333,stroke:#aaa,color:#fff
    classDef parseNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef enrichNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef apiNode fill:#7a1c1c,stroke:#e74c3c,color:#fff
    classDef consumerNode fill:#5a2d82,stroke:#9b59b6,color:#fff

    class ParsedFiles sourceNode
    class Adapter,ExportParser parseNode
    class Enriched,JobsDep enrichNode
    class Server,APIClient,Endpoints apiNode
    class Cards,Timeline,ResumeItems,ResumeMgrUI consumerNode

    ParsedFiles --> Adapter --> ExportParser --> Enriched --> JobsDep
    Server -.->|serves| ParsedFiles
    Server --> Endpoints
    APIClient --> Endpoints
    APIClient --> ResumeMgrUI
    JobsDep --> Cards
    JobsDep --> Timeline
    JobsDep --> ResumeItems
```

---

## 8. Layout System

How the resize handle, layout toggle, and viewport work together to control the split-panel UI.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1e3a5f","primaryTextColor":"#ffffff","primaryBorderColor":"#4a90d9","lineColor":"#a0c4e8","secondaryColor":"#2a4a7f","tertiaryColor":"#0d2b4e","clusterBkg":"#0d2b4e","clusterBorder":"#4a90d9","titleColor":"#ffffff","edgeLabelBackground":"#1e3a5f","fontFamily":"trebuchet ms, verdana, arial","fontSize":"14px"}}}%%
flowchart TD
    subgraph ResizeFlow["Resize Handle Flow"]
        subgraph Handle["ResizeHandle.vue"]
            Drag["drag"]
            StepBtns["← step →"]
            CollapseBtn["collapse"]
        end
        ScenePct["scenePercentage\n0–100%"]
        StoreUpd["appStore\n.setScenePercentage()"]
        StateUpd["useAppState\n(persist to disk)"]
        BERecenter["bullsEye\n.recenter()"]
        subgraph WidthOut["Width Outputs"]
            SceneWidth["sceneWidth = pct%"]
            ResumeWidth["resumeWidth\n= (100-pct)%"]
            Labels["'Scene 42%'\n'Resume 58%'"]
        end
        SceneCenter["sceneCenter\n= rect.left + w/2"]
    end

    subgraph ToggleFlow["Layout Toggle Flow"]
        ToggleFn["toggleLayout()"]
        Orientation["scene-left\nscene-right"]
        FlexDir["flex-direction:\nrow | row-reverse"]
    end

    classDef handleNode fill:#7a3b00,stroke:#e67e22,color:#fff
    classDef compNode fill:#1e3a5f,stroke:#4a90d9,color:#fff
    classDef storeNode fill:#5a2d82,stroke:#9b59b6,color:#fff
    classDef toggleNode fill:#2e6b3e,stroke:#5cb85c,color:#fff
    classDef viewportNode fill:#006666,stroke:#1abc9c,color:#fff

    class Drag,StepBtns,CollapseBtn handleNode
    class ScenePct,StoreUpd,StateUpd,BERecenter compNode
    class SceneWidth,ResumeWidth,Labels storeNode
    class ToggleFn,Orientation,FlexDir toggleNode
    class SceneCenter viewportNode

    Drag --> ScenePct
    StepBtns --> ScenePct
    CollapseBtn --> ScenePct
    ScenePct --> StoreUpd
    ScenePct --> StateUpd
    ScenePct --> BERecenter
    StoreUpd --> SceneWidth
    StoreUpd --> ResumeWidth
    StoreUpd --> Labels
    BERecenter --> SceneCenter
    ToggleFn --> Orientation --> FlexDir
```
