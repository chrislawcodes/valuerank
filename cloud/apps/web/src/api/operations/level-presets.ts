// ============================================================================
// TYPES
// ============================================================================

export type LevelPresetVersion = {
  id: string;
  version: string;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  createdAt: string;
};

export type LevelPreset = {
  id: string;
  name: string;
  updatedAt: string;
  latestVersion: LevelPresetVersion | null;
};

export type LevelPresetsQueryData = {
  levelPresets: LevelPreset[];
};

// ============================================================================
// QUERIES
// ============================================================================

export { GetLevelPresetsDocument as LEVEL_PRESETS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateLevelPresetDocument as CREATE_LEVEL_PRESET_MUTATION } from '../../generated/graphql';
export { UpdateLevelPresetDocument as UPDATE_LEVEL_PRESET_MUTATION } from '../../generated/graphql';
export { DeleteLevelPresetDocument as DELETE_LEVEL_PRESET_MUTATION } from '../../generated/graphql';
