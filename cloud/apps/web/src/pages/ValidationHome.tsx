import { Link } from 'react-router-dom';
import { useQuery } from 'urql';
import { ShieldCheck, FlaskConical, BarChart3, History, ArrowRight, Activity, CheckCircle2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import {
  RUNS_QUERY,
  RUN_COUNT_QUERY,
  type RunCountQueryResult,
  type Run,
  type RunsQueryResult,
} from '../api/operations/runs';
import {
  TEMP_ZERO_VERIFICATION_REPORT_QUERY,
  type TempZeroVerificationReportQueryResult,
} from '../api/operations/temp-zero-verification';
import {
  ORDER_INVARIANCE_REVIEW_QUERY,
  type OrderInvarianceReviewQueryResult,
} from '../api/operations/order-invariance';

function formatTimestamp(value: string | null | undefined): string {
  if (value == null) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function getRunTone(run: Pick<Run, 'status'>): string {
  switch (run.status) {
    case 'RUNNING':
    case 'PENDING':
    case 'SUMMARIZING':
      return 'text-amber-700';
    case 'FAILED':
    case 'CANCELLED':
      return 'text-red-700';
    case 'COMPLETED':
      return 'text-teal-700';
    default:
      return 'text-gray-700';
  }
}

const resourceCards = [
  {
    title: 'Temp=0 Effect',
    description: 'Detailed drift and transcript review for the locked temp=0 package.',
    to: '/assumptions/temp-zero-effect',
    icon: FlaskConical,
  },
  {
    title: 'Validation Analysis',
    description: 'Backend-driven order invariance analysis for the current review set.',
    to: '/assumptions/analysis',
    icon: BarChart3,
  },
  {
    title: 'Legacy Validation',
    description: 'Older v1 order-effect view retained for migration compatibility.',
    to: '/assumptions/analysis-v1',
    icon: History,
  },
];

export function ValidationHome() {
  const [{ data: runCountData, fetching: runCountFetching, error: runCountError }] = useQuery<RunCountQueryResult>({
    query: RUN_COUNT_QUERY,
    variables: { runCategory: 'VALIDATION', runType: 'ALL' },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: recentRunsData, fetching: recentRunsFetching, error: recentRunsError }] = useQuery<RunsQueryResult>({
    query: RUNS_QUERY,
    variables: { runCategory: 'VALIDATION', runType: 'ALL', limit: 6, offset: 0 },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: tempZeroData, fetching: tempZeroFetching, error: tempZeroError }] = useQuery<TempZeroVerificationReportQueryResult>({
    query: TEMP_ZERO_VERIFICATION_REPORT_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: reviewData, fetching: reviewFetching, error: reviewError }] = useQuery<OrderInvarianceReviewQueryResult>({
    query: ORDER_INVARIANCE_REVIEW_QUERY,
    requestPolicy: 'cache-and-network',
  });

  const recentValidationRuns = recentRunsData?.runs ?? [];
  const totalValidationRuns = runCountData?.runCount ?? 0;
  const tempZeroReport = tempZeroData?.tempZeroVerificationReport ?? null;
  const reviewSummary = reviewData?.assumptionsOrderInvarianceReview.summary ?? null;
  const loadError = runCountError ?? recentRunsError ?? tempZeroError ?? reviewError;
  const hasSettledInitialLoad = (
    runCountData !== undefined
    && recentRunsData !== undefined
    && tempZeroData !== undefined
    && reviewData !== undefined
  );
  const isLoading = !hasSettledInitialLoad && (runCountFetching || recentRunsFetching || tempZeroFetching || reviewFetching);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
          <ShieldCheck className="h-4 w-4" />
          Validation
        </div>
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Validation</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Validation is the reporting and reference home for methodology checks. Domain-scoped validation work still launches from
            <span className="font-medium"> Domains &gt; Runs</span>; this page helps you monitor validation history and review the
            current cross-domain signals.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-medium text-[#1A1A1A]">How Validation Works Now</h2>
            <p className="mt-2 text-sm text-gray-600 max-w-3xl">
              Use domain Runs to launch validation-scoped work, then come back here to review recent validation history and the standing temp=0
              and order-invariance reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/domains"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open Domains
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/runs?runCategory=VALIDATION"
              className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
            >
              Validation Run History
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {loadError && <ErrorMessage message={`Failed to load validation reporting: ${loadError.message}`} />}
      {isLoading && <Loading size="sm" text="Loading validation reporting..." />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="spacious" className="h-full">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <Activity className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-[#1A1A1A]">Validation Run History</h2>
              <p className="text-sm text-gray-600">
                Cross-domain run history filtered to the `VALIDATION` run category.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Validation Runs</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{totalValidationRuns}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Recent Runs Loaded</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{recentValidationRuns.length}</div>
                </div>
              </div>
              {recentValidationRuns.length > 0 ? (
                <div className="space-y-2">
                  {recentValidationRuns.slice(0, 4).map((run) => (
                    <Link
                      key={run.id}
                      to={`/runs/${run.id}`}
                      className="block rounded-lg border border-gray-200 px-3 py-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{run.definition.name}</div>
                          <div className="text-xs text-gray-500">
                            {run.definition.domain?.name ? `${run.definition.domain.name} · ` : ''}
                            {formatTimestamp(run.createdAt)}
                          </div>
                        </div>
                        <div className={`text-xs font-medium uppercase tracking-wide ${getRunTone(run)}`}>
                          {run.status}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  No validation runs yet. Launch validation-scoped work from a domain’s Runs tab.
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card padding="spacious" className="h-full">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-[#1A1A1A]">Temp=0 Snapshot</h2>
              <p className="text-sm text-gray-600">
                Latest cross-model stability report from the temp=0 validation package.
              </p>
              {tempZeroReport ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Models Reported</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{tempZeroReport.models.length}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Transcripts Analyzed</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{tempZeroReport.transcriptCount}</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Generated {formatTimestamp(tempZeroReport.generatedAt)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600">Temp=0 reporting is not available yet.</p>
              )}
              <Link to="/assumptions/temp-zero-effect" className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 hover:text-teal-900">
                Open Temp=0 Effect
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Card>

        <Card padding="spacious" className="h-full">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-[#1A1A1A]">Order-Invariance Review</h2>
              <p className="text-sm text-gray-600">
                Review-state snapshot for the current order-invariance package.
              </p>
              {reviewSummary ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Reviewed</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">
                        {reviewSummary.reviewedVignettes} / {reviewSummary.totalVignettes}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pending</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{reviewSummary.pendingVignettes}</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">
                    Launch readiness: <span className="font-medium">{reviewSummary.launchReady ? 'Ready' : 'Needs review'}</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600">Order-invariance review data is not available yet.</p>
              )}
              <div className="flex flex-wrap gap-3">
                <Link to="/assumptions/analysis" className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 hover:text-teal-900">
                  Open Validation Analysis
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/assumptions/analysis-v1" className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
                  Open Legacy View
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {resourceCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.to} to={card.to} className="block">
              <Card variant="interactive" padding="spacious" className="h-full">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-[#1A1A1A]">{card.title}</h2>
                    <p className="mt-2 text-sm text-gray-600">{card.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
