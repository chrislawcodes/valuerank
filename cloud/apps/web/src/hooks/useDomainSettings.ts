import { useQuery, useMutation } from 'urql';
import {
  DOMAIN_SETTINGS_QUERY,
  DOMAIN_CONFIG_SNAPSHOTS_QUERY,
  SET_DOMAIN_SETTINGS_MUTATION,
  type DomainSettings,
  type DomainConfigSnapshotSummary,
  type DomainSettingsQueryResult,
  type DomainSettingsQueryVariables,
  type DomainConfigSnapshotsQueryResult,
  type DomainConfigSnapshotsQueryVariables,
  type SetDomainSettingsMutationResult,
  type SetDomainSettingsMutationVariables,
} from '../api/operations/domains';

type UseDomainSettingsResult = {
  settings: DomainSettings | null;
  snapshots: DomainConfigSnapshotSummary[];
  loading: boolean;
  saving: boolean;
  error: Error | null;
  setDomainSettings: (input: SetDomainSettingsMutationVariables) => Promise<void>;
  refetch: () => void;
};

export function useDomainSettings(domainId: string | null): UseDomainSettingsResult {
  const [settingsResult, reexecuteSettings] = useQuery<
    DomainSettingsQueryResult,
    DomainSettingsQueryVariables
  >({
    query: DOMAIN_SETTINGS_QUERY,
    variables: { domainId: domainId ?? '' },
    pause: !domainId,
  });

  const [snapshotsResult] = useQuery<
    DomainConfigSnapshotsQueryResult,
    DomainConfigSnapshotsQueryVariables
  >({
    query: DOMAIN_CONFIG_SNAPSHOTS_QUERY,
    variables: { domainId: domainId ?? '', limit: 20 },
    pause: !domainId,
  });

  const [mutationResult, executeSetDomainSettings] = useMutation<
    SetDomainSettingsMutationResult,
    SetDomainSettingsMutationVariables
  >(SET_DOMAIN_SETTINGS_MUTATION);

  const setDomainSettings = async (input: SetDomainSettingsMutationVariables) => {
    const result = await executeSetDomainSettings(input);
    if (result.error) {
      throw result.error;
    }
    reexecuteSettings({ requestPolicy: 'network-only' });
  };

  const loading = settingsResult.fetching || snapshotsResult.fetching;
  const error =
    settingsResult.error instanceof Error
      ? settingsResult.error
      : snapshotsResult.error instanceof Error
        ? snapshotsResult.error
        : null;

  return {
    settings: settingsResult.data?.domainSettings ?? null,
    snapshots: snapshotsResult.data?.domainConfigSnapshots ?? [],
    loading,
    saving: mutationResult.fetching,
    error,
    setDomainSettings,
    refetch: () => reexecuteSettings({ requestPolicy: 'network-only' }),
  };
}
