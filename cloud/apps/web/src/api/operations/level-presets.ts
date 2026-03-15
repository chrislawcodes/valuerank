import { gql } from 'urql';

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

export const LEVEL_PRESETS_QUERY = gql`
  query GetLevelPresets {
    levelPresets {
      id
      name
      updatedAt
      latestVersion {
        id
        version
        l1
        l2
        l3
        l4
        l5
        createdAt
      }
    }
  }
`;

export const CREATE_LEVEL_PRESET_MUTATION = gql`
  mutation CreateLevelPreset($input: CreateLevelPresetInput!) {
    createLevelPreset(input: $input) {
      id
      name
      latestVersion {
        id
        version
        l1
        l2
        l3
        l4
        l5
      }
    }
  }
`;

export const UPDATE_LEVEL_PRESET_MUTATION = gql`
  mutation UpdateLevelPreset($id: ID!, $input: UpdateLevelPresetInput!) {
    updateLevelPreset(id: $id, input: $input) {
      id
      name
      updatedAt
      latestVersion {
        id
        version
        l1
        l2
        l3
        l4
        l5
      }
    }
  }
`;

export const DELETE_LEVEL_PRESET_MUTATION = gql`
  mutation DeleteLevelPreset($id: ID!) {
    deleteLevelPreset(id: $id) {
      id
    }
  }
`;
