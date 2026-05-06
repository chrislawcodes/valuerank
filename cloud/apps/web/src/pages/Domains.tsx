import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { AnalysisContextBar } from '../components/analysis/AnalysisContextBar';
import { CopyVisualButton } from '../components/ui/CopyVisualButton';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { CoverageMatrix } from '../components/domains/CoverageMatrix';
import { useDomains } from '../hooks/useDomains';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
} from '../api/operations/domainAnalysis';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { selectPreferredSignature } from '../components/domains/coverageMatrixHelpers';
import {
  formatSignatureOptionLabel,
  getSignaturePriority,
} from '../utils/domainAnalysisUtils';

type FolderKey = string;

const LAST_DOMAIN_KEY = 'valuerank:lastSelectedDomainId';

export function Domains() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSelectedFolder = searchParams.get('domainId') ?? localStorage.getItem(LAST_DOMAIN_KEY) ?? '';
  const signatureParam = searchParams.get('signature');
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>(initialSelectedFolder);
  const [selectedSignature, setSelectedSignature] = useState<string>(signatureParam ?? '');
  const [signatureSelectionResolved, setSignatureSelectionResolved] = useState(signatureParam != null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);
  const initializedModelSelection = useRef(false);
  const coverageRef = useRef<HTMLDivElement>(null);

  const {
    domains,
    error: domainError,
    queryLoading: domainLoading,
  } = useDomains();
  const resolvedDomainId = useMemo(() => {
    if (selectedFolder !== '' && domains.some((domain) => domain.id === selectedFolder)) {
      return selectedFolder;
    }
    return domains[0]?.id ?? '';
  }, [domains, selectedFolder]);

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    { domainId: string }
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: resolvedDomainId },
    pause: resolvedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const [{ data: llmModelsData, fetching: llmModelsLoading, error: llmModelsError }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });

  const availableSignatures = useMemo(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );
  const signatureOptions = useMemo<DomainAvailableSignature[]>(() => {
    return availableSignatures
      .map((option, index) => ({ option, index }))
      .sort((left, right) => {
        const priority = getSignaturePriority(left.option) - getSignaturePriority(right.option);
        return priority !== 0 ? priority : left.index - right.index;
      })
      .map(({ option }) => option);
  }, [availableSignatures]);

  const activeModels = useMemo(
    () => (llmModelsData?.llmModels ?? []).filter((model) => model.status === 'ACTIVE'),
    [llmModelsData],
  );
  const defaultModelIds = useMemo(() => {
    const defaults = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
    return defaults.length > 0 ? defaults : activeModels.map((model) => model.modelId);
  }, [activeModels]);
  const modelOptions = useMemo(
    () => activeModels.map((model) => ({
      value: model.modelId,
      label: model.displayName,
      isDefault: defaultModelIds.includes(model.modelId),
    })),
    [activeModels, defaultModelIds],
  );
  const selectedModelSet = selectedModelIds ?? defaultModelIds;
  const selectedDomain = domains.find((domain) => domain.id === resolvedDomainId) ?? null;

  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedFolder !== '' && domains.some((domain) => domain.id === selectedFolder)) return;
    const lastId = localStorage.getItem(LAST_DOMAIN_KEY);
    const lastDomain = lastId != null ? domains.find((domain) => domain.id === lastId) : null;
    setSelectedFolder(lastDomain?.id ?? domains[0]?.id ?? '');
  }, [domains, selectedFolder]);

  useEffect(() => {
    if (signatureOptions.length === 0) {
      if (selectedSignature !== '') setSelectedSignature('');
      if (!signatureSelectionResolved) setSignatureSelectionResolved(true);
      return;
    }

    if (selectedSignature !== '' && signatureOptions.some((option) => option.signature === selectedSignature)) {
      if (!signatureSelectionResolved) setSignatureSelectionResolved(true);
      return;
    }

    if (selectedSignature === '' && signatureSelectionResolved) return;

    setSelectedSignature(selectPreferredSignature(signatureOptions));
    setSignatureSelectionResolved(true);
  }, [selectedSignature, signatureOptions, signatureSelectionResolved]);

  useEffect(() => {
    if (initializedModelSelection.current) return;
    if (llmModelsLoading || llmModelsData == null) return;
    setSelectedModelIds(defaultModelIds);
    initializedModelSelection.current = true;
  }, [defaultModelIds, llmModelsData, llmModelsLoading]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedDomain != null) {
      next.set('domainId', resolvedDomainId);
    } else {
      next.delete('domainId');
    }
    if (selectedSignature === '') next.delete('signature');
    else next.set('signature', selectedSignature);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [resolvedDomainId, searchParams, selectedDomain, selectedSignature, setSearchParams]);

  const showPageLoader = domainLoading
    || signaturesLoading
    || llmModelsLoading
    || !signatureSelectionResolved
    || (resolvedDomainId !== '' && selectedDomain == null);

  const coverageOptions = useMemo(
    () => {
      if (signatureOptions.length === 0) {
        return [{ value: '', label: 'No signatures with completed runs', disabled: true }];
      }

      return [
        { value: '', label: 'All signatures' },
        ...signatureOptions.map((option) => ({
          value: option.signature,
          label: formatSignatureOptionLabel(option),
        })),
      ];
    },
    [signatureOptions],
  );

  if (domainError != null || signaturesError != null || llmModelsError != null) {
    return (
      <div className="space-y-6">
        <ErrorMessage message={`Failed to load domains page: ${(domainError ?? signaturesError ?? llmModelsError)?.message ?? 'Unknown error'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <AnalysisContextBar
        domain={{
          label: 'Domain',
          value: resolvedDomainId,
          options:
            domains.length === 0
              ? [{ value: '', label: 'No domains available', disabled: true }]
              : domains.map((domain) => ({ value: domain.id, label: domain.name })),
          onChange: (value) => {
            setSelectedFolder(value);
            localStorage.setItem(LAST_DOMAIN_KEY, value);
          },
          disabled: domainLoading || domains.length === 0,
        }}
        signature={{
          label: 'Signature',
          value: selectedSignature,
          options: coverageOptions,
          onChange: (value) => setSelectedSignature(value),
          disabled: signaturesLoading || signatureOptions.length === 0,
        }}
        models={{
          label: 'Models',
          selectedModelIds,
          defaultModelIds,
          options: modelOptions,
          onChange: (value) => {
            if (value.length === 0) {
              setSelectedModelIds(defaultModelIds);
              return;
            }
            setSelectedModelIds(value);
          },
        }}
      />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Domains</p>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Overview</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Browse the active domain overview, then inspect value-pair coverage for the selected domain and signature.
        </p>
      </div>

      {showPageLoader ? (
        <Loading size="lg" text="Loading domains page..." />
      ) : (
        <div className="space-y-6">
          {selectedDomain != null ? (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-base font-medium text-gray-900">Value Coverage</h2>
                  <p className="text-sm text-gray-600">
                    Batch density across Schwartz value pairs.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/domains/start/${selectedDomain.id}`}
                    className="inline-flex items-center justify-center rounded-lg border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Add Paired Batches for all Vignettes
                  </Link>
                  <CopyVisualButton targetRef={coverageRef} label="coverage table" />
                </div>
              </div>
              <CoverageMatrix
                ref={coverageRef}
                domainId={resolvedDomainId}
                signature={selectedSignature}
                modelIds={selectedModelSet}
              />
            </section>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Select a domain to see its overview.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
