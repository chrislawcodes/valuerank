import { ModelGroupsView } from './ModelsGroups';

/**
 * Model Groups V2 page (route `/models/v2`). Same page as `/models`, with the
 * internal-agreement overlay on, so the two can be compared in production.
 */
export function ModelsGroupsV2() {
  return <ModelGroupsView showInternalAgreement />;
}
