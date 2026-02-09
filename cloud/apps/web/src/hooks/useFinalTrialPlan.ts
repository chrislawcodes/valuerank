import { useQuery } from 'urql';
import {
    FINAL_TRIAL_PLAN_QUERY,
    type FinalTrialPlan,
    type FinalTrialPlanQueryResult,
} from '../api/operations/final-trial';

type UseFinalTrialPlanOptions = {
    definitionId: string;
    models: string[];
    pause?: boolean;
};

type UseFinalTrialPlanResult = {
    plan: FinalTrialPlan | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
};

export function useFinalTrialPlan(options: UseFinalTrialPlanOptions): UseFinalTrialPlanResult {
    const { definitionId, models, pause = false } = options;

    const shouldPause = pause || models.length === 0;

    const [result, reexecuteQuery] = useQuery<FinalTrialPlanQueryResult>({
        query: FINAL_TRIAL_PLAN_QUERY,
        variables: { definitionId, models },
        pause: shouldPause,
        requestPolicy: 'cache-and-network',
    });

    return {
        plan: result.data?.finalTrialPlan ?? null,
        loading: result.fetching,
        error: result.error ? new Error(result.error.message) : null,
        refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
    };
}
