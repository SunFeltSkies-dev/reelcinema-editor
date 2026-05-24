import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorDensityPresetName } from '@/config/editor-layout'
import { DEFAULT_EDITOR_DENSITY_PRESET, normalizeEditorDensityPreset } from '@/config/editor-layout'
import {
  HOTKEYS,
  normalizeHotkeyBinding,
  sanitizeHotkeyOverrides,
  type HotkeyKey,
  type HotkeyOverrideMap,
} from '@/config/hotkeys'

/**
 * App-wide settings stored in localStorage
 */
interface AppSettings {
  // Timeline defaults
  snapEnabled: boolean
  // Canvas/gizmo snap (preview area) — independent from timeline frame snap
  canvasSnapEnabled: boolean
  showWaveforms: boolean
  showFilmstrips: boolean

  // Interface
  editorDensity: EditorDensityPresetName

  // Performance
  maxUndoHistory: number
  autoSaveInterval: number // minutes (0 = disabled)

  // Keyboard shortcuts
  hotkeyOverrides: HotkeyOverrideMap
}

interface SettingsActions {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setHotkeyBinding: (key: HotkeyKey, binding: string) => void
  replaceHotkeyOverrides: (overrides: HotkeyOverrideMap) => void
  resetHotkeyBinding: (key: HotkeyKey) => void
  resetHotkeys: () => void
  resetToDefaults: () => void
}

type SettingsStore = AppSettings & SettingsActions

function areHotkeyOverridesEqual(left: HotkeyOverrideMap, right: HotkeyOverrideMap): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key as HotkeyKey] === right[key as HotkeyKey])
}

const DEFAULT_SETTINGS: AppSettings = {
  // Timeline defaults
  snapEnabled: true,
  canvasSnapEnabled: true,
  showWaveforms: true,
  showFilmstrips: true,

  // Interface
  editorDensity: DEFAULT_EDITOR_DENSITY_PRESET,

  // Performance
  maxUndoHistory: 50,
  autoSaveInterval: 0, // Auto-save disabled by default

  // Keyboard shortcuts
  hotkeyOverrides: {},
}

/**
 * Settings store with localStorage persistence.
 *
 * Usage:
 *   const theme = useSettingsStore(s => s.theme);
 *   const setSetting = useSettingsStore(s => s.setSetting);
 *   setSetting('theme', 'light');
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setSetting: (key, value) =>
        set(() => {
          if (key === 'editorDensity') {
            return { editorDensity: normalizeEditorDensityPreset(value) }
          }
          return { [key]: value }
        }),

      setHotkeyBinding: (key, binding) =>
        set((state) => {
          const normalizedBinding = normalizeHotkeyBinding(binding)
          if (!normalizedBinding || normalizedBinding === HOTKEYS[key]) {
            if (!(key in state.hotkeyOverrides)) {
              return state
            }

            const remainingOverrides = { ...state.hotkeyOverrides }
            delete remainingOverrides[key]
            return { hotkeyOverrides: remainingOverrides }
          }

          if (state.hotkeyOverrides[key] === normalizedBinding) {
            return state
          }

          return {
            hotkeyOverrides: {
              ...state.hotkeyOverrides,
              [key]: normalizedBinding,
            },
          }
        }),

      replaceHotkeyOverrides: (overrides) =>
        set((state) => {
          const normalizedOverrides = sanitizeHotkeyOverrides(overrides)

          if (areHotkeyOverridesEqual(state.hotkeyOverrides, normalizedOverrides)) {
            return state
          }

          return { hotkeyOverrides: normalizedOverrides }
        }),

      resetHotkeyBinding: (key) =>
        set((state) => {
          if (!(key in state.hotkeyOverrides)) {
            return state
          }

          const remainingOverrides = { ...state.hotkeyOverrides }
          delete remainingOverrides[key]
          return { hotkeyOverrides: remainingOverrides }
        }),

      resetHotkeys: () =>
        set((state) => {
          if (Object.keys(state.hotkeyOverrides).length === 0) {
            return state
          }

          return { hotkeyOverrides: {} }
        }),

      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'freecut-settings',
      merge: (persistedState, currentState) => {
        const typedState = (persistedState as Partial<AppSettings> | undefined) ?? {}

        return {
          ...currentState,
          ...typedState,
          hotkeyOverrides: sanitizeHotkeyOverrides(typedState.hotkeyOverrides),
          editorDensity: normalizeEditorDensityPreset(typedState.editorDensity),
        }
      },
    },
  ),
)
