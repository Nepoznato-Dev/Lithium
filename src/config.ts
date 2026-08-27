export type FeatureState = 'stable' | 'beta' | 'experimental' | 'deprecated';
export const phaseConfig = {
  calculator: { owner: 'core', phase: 2, dependencies: [], storage: 'none', offline: true, roles: ['student'], state: 'stable' as FeatureState },
  converter: { owner: 'core', phase: 2, dependencies: [], storage: 'none', offline: true, roles: ['student'], state: 'stable' as FeatureState },
  whiteboard: { owner: 'core', phase: 2, dependencies: ['browser-canvas'], storage: 'localStorage', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  dashboard: { owner: 'core', phase: 2, dependencies: [], storage: 'localStorage', offline: true, roles: ['student'], state: 'stable' as FeatureState },
  games: { owner: 'media', phase: 4, dependencies: [], storage: 'none', offline: false, roles: ['student'], state: 'experimental' as FeatureState },
  notes: { owner: 'study', phase: 3, dependencies: ['indexeddb'], storage: 'indexeddb', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  flashcards: { owner: 'study', phase: 3, dependencies: ['indexeddb'], storage: 'indexeddb', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  dictionary: { owner: 'study', phase: 3, dependencies: ['indexeddb'], storage: 'indexeddb', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  formulas: { owner: 'study', phase: 3, dependencies: ['indexeddb'], storage: 'indexeddb', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  pomodoro: { owner: 'study', phase: 3, dependencies: ['indexeddb'], storage: 'indexeddb', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  scientificCalculator: { owner: 'study', phase: 3, dependencies: [], storage: 'none', offline: true, roles: ['student'], state: 'beta' as FeatureState },
  browser: { owner: 'browser', phase: 5, dependencies: [], storage: 'localStorage', offline: false, roles: ['student'], state: 'experimental' as FeatureState },
  outcomeLearning: { owner: 'predictive', phase: 9, dependencies: [], storage: 'localStorage', offline: true, roles: ['student'], state: 'experimental' as FeatureState },
  crashPrevention: { owner: 'predictive', phase: 9, dependencies: [], storage: 'localStorage', offline: true, roles: ['student'], state: 'experimental' as FeatureState },
  hardening: { owner: 'platform', phase: 10, dependencies: [], storage: 'localStorage', offline: true, roles: ['student'], state: 'beta' as FeatureState },
} as const;
export const currentPhase = 10;
export const isFeatureEnabled = (feature: keyof typeof phaseConfig) => phaseConfig[feature].phase <= currentPhase && phaseConfig[feature].state !== 'deprecated';
