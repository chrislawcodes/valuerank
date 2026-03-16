import { assembleTemplate } from '@valuerank/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gql, useMutation, useQuery } from 'urql';
import {
  DOMAINS_QUERY,
  type DomainsQueryResult,
  type DomainsQueryVariables,
} from '../api/operations/domains';
import {
  DOMAIN_CONTEXTS_QUERY,
  type DomainContextsQueryResult,
  type DomainContextsQueryVariables,
} from '../api/operations/domain-contexts';
import {
  CREATE_JOB_CHOICE_PAIR_MUTATION,
  type CreateJobChoicePairResult,
  type CreateJobChoicePairVariables,
} from '../api/operations/job-choice-pair';
import {
  VALUE_STATEMENTS_QUERY,
  type ValueStatementsQueryResult,
  type ValueStatementsQueryVariables,
} from '../api/operations/value-statements';
import {
  LEVEL_PRESETS_QUERY,
  type LevelPresetsQueryData,
} from '../api/operations/level-presets';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';

type Preamble = {
  id: string;
  name: string;
  latestVersion: { id: string; version: string } | null;
};

type PreamblesQueryResult = { preambles: Preamble[] };

const PREAMBLES_QUERY = gql`
  query PreamblesForJobChoice {
    preambles {
      id
      name
      latestVersion {
        id
        version
      }
    }
  }
`;

export function JobChoiceNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [selectedPreambleVersionId, setSelectedPreambleVersionId] = useState('');
  const [selectedLevelPresetVersionId, setSelectedLevelPresetVersionId] = useState('');
  const [selectedContextId, setSelectedContextId] = useState('');
  const [selectedValueFirstId, setSelectedValueFirstId] = useState('');
  const [selectedValueSecondId, setSelectedValueSecondId] = useState('');
  const [name, setName] = useState('');
  const [nameWasAutoSet, setNameWasAutoSet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [{ data: domainsData, error: domainsError }] = useQuery<
    DomainsQueryResult,
    DomainsQueryVariables
  >({
    query: DOMAINS_QUERY,
    variables: { limit: 1000, offset: 0 },
  });

  const [{ data: preamblesData, error: preamblesError }] = useQuery<PreamblesQueryResult>({
    query: PREAMBLES_QUERY,
  });

  const [{ data: contextsData, error: contextsError }] = useQuery<
    DomainContextsQueryResult,
    DomainContextsQueryVariables
  >({
    query: DOMAIN_CONTEXTS_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
  });

  const [{ data: valueStatementsData, error: valueStatementsError }] = useQuery<
    ValueStatementsQueryResult,
    ValueStatementsQueryVariables
  >({
    query: VALUE_STATEMENTS_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
  });

  const [{ data: levelPresetsData }] = useQuery<LevelPresetsQueryData>({
    query: LEVEL_PRESETS_QUERY,
  });

  const [, createPair] = useMutation<CreateJobChoicePairResult, CreateJobChoicePairVariables>(
    CREATE_JOB_CHOICE_PAIR_MUTATION,
  );

  const domains = domainsData?.domains ?? [];
  const preambles = preamblesData?.preambles ?? [];
  const contexts = contextsData?.domainContexts ?? [];
  const valueStatements = valueStatementsData?.valueStatements ?? [];
  const requestedDomainId = searchParams.get('domainId') ?? '';

  const valueFirst = valueStatements.find((v) => v.id === selectedValueFirstId) ?? null;
  const valueSecond = valueStatements.find((v) => v.id === selectedValueSecondId) ?? null;
  const selectedContext = contexts.find((c) => c.id === selectedContextId) ?? null;

  const secondValueOptions = valueStatements.filter((v) => v.id !== selectedValueFirstId);

  const previewText = useMemo(() => {
    if (selectedContext == null || valueFirst == null || valueSecond == null) return null;
    return assembleTemplate(selectedContext.text, {
      context_id: selectedContextId,
      value_first: { token: valueFirst.token, body: valueFirst.body },
      value_second: { token: valueSecond.token, body: valueSecond.body },
    });
  }, [selectedContext, selectedContextId, valueFirst, valueSecond]);

  const loadingError =
    domainsError?.message ??
    preamblesError?.message ??
    contextsError?.message ??
    valueStatementsError?.message ??
    null;

  useEffect(() => {
    if (selectedDomainId !== '') return;
    if (requestedDomainId === '') return;
    if (!domains.some((domain) => domain.id === requestedDomainId)) return;
    handleDomainChange(requestedDomainId);
  }, [domains, requestedDomainId, selectedDomainId]);

  function handleDomainChange(domainId: string) {
    setSelectedDomainId(domainId);
    setSelectedContextId('');
    setSelectedValueFirstId('');
    setSelectedValueSecondId('');
    setName('');
    setNameWasAutoSet(false);
    setErrorMessage(null);
    // Pre-populate level preset from domain default
    const domain = domains.find((d) => d.id === domainId) ?? null;
    setSelectedLevelPresetVersionId(domain?.defaultLevelPresetVersion?.id ?? '');
  }

  function handleValueFirstChange(valueId: string) {
    const nextFirst = valueStatements.find((v) => v.id === valueId) ?? null;
    setSelectedValueFirstId(valueId);
    setSelectedValueSecondId('');
    setErrorMessage(null);
    if (nextFirst != null && (name === '' || nameWasAutoSet)) {
      setName(`${nextFirst.token} vs ...`);
      setNameWasAutoSet(true);
    }
  }

  function handleValueSecondChange(valueId: string) {
    const nextSecond = valueStatements.find((v) => v.id === valueId) ?? null;
    setSelectedValueSecondId(valueId);
    setErrorMessage(null);
    if (nextSecond != null && valueFirst != null && (name === '' || nameWasAutoSet)) {
      setName(`${valueFirst.token} vs ${nextSecond.token}`);
      setNameWasAutoSet(true);
    }
  }

  function handleNameChange(nextName: string) {
    setName(nextName);
    setNameWasAutoSet(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      selectedDomainId === '' ||
      selectedContextId === '' ||
      selectedValueFirstId === '' ||
      selectedValueSecondId === '' ||
      name.trim() === ''
    ) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await createPair({
      input: {
        name: name.trim(),
        domainId: selectedDomainId,
        contextId: selectedContextId,
        valueFirstId: selectedValueFirstId,
        valueSecondId: selectedValueSecondId,
        preambleVersionId: selectedPreambleVersionId !== '' ? selectedPreambleVersionId : null,
        levelPresetVersionId: selectedLevelPresetVersionId !== '' ? selectedLevelPresetVersionId : null,
      },
    });

    setIsSubmitting(false);

    if (result.error != null) {
      setErrorMessage(result.error.message);
      return;
    }

    if (result.data != null) {
      navigate(`/definitions/${result.data.createJobChoicePair.aFirst.id}`);
    }
  }

  const canSubmit =
    selectedDomainId !== '' &&
    selectedContextId !== '' &&
    selectedValueFirstId !== '' &&
    selectedValueSecondId !== '' &&
    name.trim() !== '' &&
    !isSubmitting;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Vignette Pair</h1>
        <p className="mt-1 text-sm text-gray-500">
          Creates two vignettes (A and B) presenting the same value trade-off in opposite orders.
        </p>
      </div>

      {loadingError != null && <ErrorMessage message={loadingError} />}

      <div className="rounded-xl border border-white/10 bg-[#1A1A1A] p-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Domain */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">Domain</label>
            <p className="text-xs text-white/40">The domain these vignettes belong to.</p>
            <select
              value={selectedDomainId}
              onChange={(event) => handleDomainChange(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
            >
              <option value="">Select a domain...</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </div>

          {/* Preamble */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">
              Preamble <span className="text-white/30">(optional)</span>
            </label>
            <p className="text-xs text-white/40">Instructions shown to the model before the scenario.</p>
            <select
              value={selectedPreambleVersionId}
              onChange={(event) => setSelectedPreambleVersionId(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
            >
              <option value="">None</option>
              {preambles.map((preamble) =>
                preamble.latestVersion != null ? (
                  <option key={preamble.latestVersion.id} value={preamble.latestVersion.id}>
                    {preamble.name} (v{preamble.latestVersion.version})
                  </option>
                ) : null,
              )}
            </select>
          </div>

          {/* Level Preset */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">
              Level Preset <span className="text-white/30">(optional)</span>
            </label>
            <p className="text-xs text-white/40">
              When set, creates 25 scenarios (5×5 intensity grid). Pre-filled from domain default.
            </p>
            <select
              value={selectedLevelPresetVersionId}
              onChange={(event) => setSelectedLevelPresetVersionId(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
            >
              <option value="">None (single scenario)</option>
              {(levelPresetsData?.levelPresets ?? []).map((preset) =>
                preset.latestVersion != null ? (
                  <option key={preset.latestVersion.id} value={preset.latestVersion.id}>
                    {preset.name} (v{preset.latestVersion.version})
                  </option>
                ) : null,
              )}
            </select>
          </div>

          {/* Context */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">Context</label>
            <p className="text-xs text-white/40">The situation the model is placed in — frames the trade-off.</p>
            <select
              value={selectedContextId}
              onChange={(event) => setSelectedContextId(event.target.value)}
              disabled={selectedDomainId === ''}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
            >
              <option value="">
                {selectedDomainId === '' ? 'Select a domain first...' : 'Select a context...'}
              </option>
              {contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.text.slice(0, 80)}
                  {context.text.length > 80 ? '...' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Value A */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">Value A</label>
            <p className="text-xs text-white/40">
              Presented first in vignette A, second in vignette B.
            </p>
            <select
              value={selectedValueFirstId}
              onChange={(event) => handleValueFirstChange(event.target.value)}
              disabled={selectedDomainId === ''}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
            >
              <option value="">
                {selectedDomainId === '' ? 'Select a domain first...' : 'Select value A...'}
              </option>
              {valueStatements.map((value) => (
                <option key={value.id} value={value.id}>
                  [{value.token}] {value.body.slice(0, 60)}
                  {value.body.length > 60 ? '...' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Value B */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">Value B</label>
            <p className="text-xs text-white/40">
              Presented first in vignette B, second in vignette A.
            </p>
            <select
              value={selectedValueSecondId}
              onChange={(event) => handleValueSecondChange(event.target.value)}
              disabled={selectedValueFirstId === ''}
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
            >
              <option value="">
                {selectedValueFirstId === '' ? 'Select value A first...' : 'Select value B...'}
              </option>
              {secondValueOptions.map((value) => (
                <option key={value.id} value={value.id}>
                  [{value.token}] {value.body.slice(0, 60)}
                  {value.body.length > 60 ? '...' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Vignette Name */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">Vignette Name</label>
            <p className="text-xs text-white/40">
              Display name for this pair — auto-filled from values. Both vignettes share this name with &quot;(A)&quot; or &quot;(B)&quot; appended.
            </p>
            <input
              type="text"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="e.g. achievement vs hedonism"
              className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
            />
          </div>

          {/* Template preview */}
          {previewText != null && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-white/70">
                Preview <span className="text-white/30">(vignette A)</span>
              </label>
              <p className="text-xs text-white/40">The prompt sent to the model — vignette B swaps the two values.</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-[#141414] p-3 text-xs text-white/70 font-mono leading-relaxed">
                {previewText}
              </pre>
            </div>
          )}

          {errorMessage != null && <ErrorMessage message={errorMessage} />}

          <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting} className="w-full">
            Create Pair
          </Button>
        </form>
      </div>
    </div>
  );
}
