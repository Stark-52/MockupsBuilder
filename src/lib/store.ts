import { create } from "zustand";
import { CanvasElement, GradientConfig, Project, Screen } from "./types";

interface HistoryEntry {
  elements: CanvasElement[];
  backgroundColor: string;
}

interface EditorState {
  // Project
  project: Project | null;
  setProject: (project: Project) => void;

  // Screens
  activeScreenIndex: number;
  setActiveScreenIndex: (index: number) => void;
  addScreen: (screen: Screen) => void;
  removeScreen: (index: number) => void;
  duplicateScreen: (index: number) => void;
  updateScreen: (index: number, updates: Partial<Screen>) => void;
  getActiveScreen: () => Screen | null;

  // Elements (operates on active screen)
  elements: CanvasElement[];
  setElements: (elements: CanvasElement[]) => void;
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  removeElement: (id: string) => void;
  moveElement: (id: string, direction: "up" | "down" | "top" | "bottom") => void;

  // Selection
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;

  // Canvas
  zoom: number;
  setZoom: (zoom: number) => void;
  backgroundColor: string;
  setBackgroundColor: (color: string) => void;
  backgroundGradient: GradientConfig | null;
  setBackgroundGradient: (gradient: GradientConfig | null) => void;

  // History (per-screen)
  history: HistoryEntry[];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Tool
  activeTool: "select" | "text" | "rectangle" | "hand";
  setActiveTool: (tool: "select" | "text" | "rectangle" | "hand") => void;

  // Internal: sync current elements back to project.screens
  _syncToProject: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Project
  project: null,
  setProject: (project) => {
    // Migrate old projects without screens
    if (!project.screens || project.screens.length === 0) {
      project = {
        ...project,
        screens: [{
          id: crypto.randomUUID(),
          name: "Screen 1",
          deviceTarget: project.deviceTarget,
          canvasWidth: project.canvasWidth,
          canvasHeight: project.canvasHeight,
          backgroundColor: project.backgroundColor,
          elements: project.elements || [],
        }],
        activeScreenIndex: 0,
      };
    }
    const screen = project.screens[project.activeScreenIndex || 0];
    set({
      project,
      activeScreenIndex: project.activeScreenIndex || 0,
      elements: screen.elements,
      backgroundColor: screen.backgroundColor,
      backgroundGradient: screen.backgroundGradient || null,
      history: [{ elements: screen.elements, backgroundColor: screen.backgroundColor }],
      historyIndex: 0,
      selectedIds: [],
    });
  },

  // Screens
  activeScreenIndex: 0,
  setActiveScreenIndex: (index) => {
    const state = get();
    // Save current screen state first
    state._syncToProject();
    const project = get().project;
    if (!project || index < 0 || index >= project.screens.length) return;
    const screen = project.screens[index];
    set({
      activeScreenIndex: index,
      elements: screen.elements,
      backgroundColor: screen.backgroundColor,
      backgroundGradient: screen.backgroundGradient || null,
      history: [{ elements: screen.elements, backgroundColor: screen.backgroundColor }],
      historyIndex: 0,
      selectedIds: [],
      project: { ...project, activeScreenIndex: index },
    });
  },

  addScreen: (screen) => {
    const state = get();
    state._syncToProject();
    const project = get().project;
    if (!project) return;
    const newScreens = [...project.screens, screen];
    const newIndex = newScreens.length - 1;
    set({
      project: { ...project, screens: newScreens, activeScreenIndex: newIndex },
      activeScreenIndex: newIndex,
      elements: screen.elements,
      backgroundColor: screen.backgroundColor,
      backgroundGradient: screen.backgroundGradient || null,
      history: [{ elements: screen.elements, backgroundColor: screen.backgroundColor }],
      historyIndex: 0,
      selectedIds: [],
    });
  },

  removeScreen: (index) => {
    const { project } = get();
    if (!project || project.screens.length <= 1) return;
    const newScreens = project.screens.filter((_, i) => i !== index);
    const newIndex = Math.min(get().activeScreenIndex, newScreens.length - 1);
    const screen = newScreens[newIndex];
    set({
      project: { ...project, screens: newScreens, activeScreenIndex: newIndex },
      activeScreenIndex: newIndex,
      elements: screen.elements,
      backgroundColor: screen.backgroundColor,
      backgroundGradient: screen.backgroundGradient || null,
      history: [{ elements: screen.elements, backgroundColor: screen.backgroundColor }],
      historyIndex: 0,
      selectedIds: [],
    });
  },

  duplicateScreen: (index) => {
    const state = get();
    state._syncToProject();
    const project = get().project;
    if (!project) return;
    const source = project.screens[index];
    const clone: Screen = {
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(),
      name: source.name + " copy",
    };
    clone.elements = clone.elements.map((el: CanvasElement) => ({
      ...el,
      id: crypto.randomUUID(),
    }));
    const newScreens = [...project.screens];
    newScreens.splice(index + 1, 0, clone);
    const newIndex = index + 1;
    set({
      project: { ...project, screens: newScreens, activeScreenIndex: newIndex },
      activeScreenIndex: newIndex,
      elements: clone.elements,
      backgroundColor: clone.backgroundColor,
      backgroundGradient: clone.backgroundGradient || null,
      history: [{ elements: clone.elements, backgroundColor: clone.backgroundColor }],
      historyIndex: 0,
      selectedIds: [],
    });
  },

  updateScreen: (index, updates) => {
    const { project } = get();
    if (!project) return;
    const newScreens = [...project.screens];
    newScreens[index] = { ...newScreens[index], ...updates };
    set({ project: { ...project, screens: newScreens } });
    // If updating current screen's canvas dimensions, reflect immediately
    if (index === get().activeScreenIndex) {
      if (updates.backgroundColor) set({ backgroundColor: updates.backgroundColor });
      if (updates.backgroundGradient !== undefined) set({ backgroundGradient: updates.backgroundGradient || null });
    }
  },

  getActiveScreen: () => {
    const { project, activeScreenIndex } = get();
    if (!project) return null;
    return project.screens[activeScreenIndex] || null;
  },

  // Elements
  elements: [],
  setElements: (elements) => set({ elements }),
  addElement: (element) => {
    const { elements, pushHistory } = get();
    pushHistory();
    set({ elements: [...elements, element] });
  },
  updateElement: (id, updates) => {
    const { elements } = get();
    set({
      elements: elements.map((el) =>
        el.id === id ? ({ ...el, ...updates } as CanvasElement) : el
      ),
    });
  },
  removeElement: (id) => {
    const { elements, selectedIds, pushHistory } = get();
    pushHistory();
    set({
      elements: elements.filter((el) => el.id !== id),
      selectedIds: selectedIds.filter((sid) => sid !== id),
    });
  },
  moveElement: (id, direction) => {
    const { elements, pushHistory } = get();
    const index = elements.findIndex((el) => el.id === id);
    if (index === -1) return;
    pushHistory();
    const newElements = [...elements];
    const [item] = newElements.splice(index, 1);
    switch (direction) {
      case "up":
        newElements.splice(Math.min(index + 1, newElements.length), 0, item);
        break;
      case "down":
        newElements.splice(Math.max(index - 1, 0), 0, item);
        break;
      case "top":
        newElements.push(item);
        break;
      case "bottom":
        newElements.unshift(item);
        break;
    }
    set({ elements: newElements });
  },

  // Selection
  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),

  // Canvas
  zoom: 0.3,
  setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(3, zoom)) }),
  backgroundColor: "#1a1a2e",
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  backgroundGradient: null,
  setBackgroundGradient: (gradient) => set({ backgroundGradient: gradient }),

  // History
  history: [],
  historyIndex: -1,
  pushHistory: () => {
    const { elements, backgroundColor, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ elements: JSON.parse(JSON.stringify(elements)), backgroundColor });
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      elements: JSON.parse(JSON.stringify(prev.elements)),
      backgroundColor: prev.backgroundColor,
      historyIndex: historyIndex - 1,
    });
  },
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      elements: JSON.parse(JSON.stringify(next.elements)),
      backgroundColor: next.backgroundColor,
      historyIndex: historyIndex + 1,
    });
  },

  // Tool
  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  // Internal: write current elements/backgroundColor back to project.screens
  _syncToProject: () => {
    const { project, activeScreenIndex, elements, backgroundColor, backgroundGradient } = get();
    if (!project) return;
    const newScreens = [...project.screens];
    newScreens[activeScreenIndex] = {
      ...newScreens[activeScreenIndex],
      elements: JSON.parse(JSON.stringify(elements)),
      backgroundColor,
      backgroundGradient: backgroundGradient || undefined,
    };
    set({ project: { ...project, screens: newScreens } });
  },
}));
