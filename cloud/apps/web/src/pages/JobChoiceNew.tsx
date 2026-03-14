import { assembleTemplate } from '@valuerank/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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

  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [selectedContextId, setSelectedContextId] = useState('');
  const [selectedValueFirstId, setSelectedValueFirstId] = useState('');
  const [selectedValueSecondId, setSelectedValueSecondId] = useState('');
  const [name, setName] = useState('');
  const [nameWasAutoSet, setNameWasAutoSet] = useState(false);
  const [selectedPreambleVersionId, setSelectedPreambleVersionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [{ data: domainsData, error: domainsError }] = useQuery<
    DomainsQueryResult,
    DomainsQueryVariables
  >({
    query: DOMAINS_QUERY,
    variables: { limit: 1000, offset: 0 },
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

  const [{ data: preamblesData, error: preamblesError }] = useQuery<PreamblesQueryResult>({
    query: PREAMBLES_QUERY,
  });

  const [, createPair] = useMutation<CreateJobChoicePairResult, CreateJobChoicePairVariables>(
    CREATE_JOB_CHOICE_PAIR_MUTATION,
  );

  const domains = domainsData?.domains ?? [];
  const contexts = contextsData?.domainContexts ?? [];
  const valueStatements = valueStatementsData?.valueStatements ?? [];
  const preambles = preamblesData?.preambles ?? [];

  const valueFirst = valueStatements.find((value) => value.id === selectedValueFirstId) ?? null;
  const valueSecond = valueStatements.find((value) => value.id === selectedValueSecondId) ?? null;
  const selectedContext = contexts.find((context) => context.id === selectedContextId) ?? null;

  const secondValueOptions = valueStatements.filter((value) => value.id !== selectedValueFirstId);

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
    contextsError?.message ??
    valueStatementsError?.message ??
    preamblesError?.message ??
    null;

  function handleDomainChange(domainId: string) {
    setSelectedDomainId(domainId);
    setSelectedContextId('');
    setSelectedValueFirstId('');
    setSelectedValueSecondId('');
    setName('');
    setNameWasAutoSet(false);
    setErrorMessage(null);
  }

  function handleValueFirstChange(valueId: string) {
    const nextFirst = valueStatements.find((value) => value.id === valueId) ?? null;

    setSelectedValueFirstId(valueId);
    setSelectedValueSecondId('');
    setErrorMessage(null);

    if (nextFirst != null && (name === '' || nameWasAutoSet)) {
      setName(`${nextFirst.token} vs ...`);
      setNameWasAutoSet(true);
    }
  }

  function handleValueSecondChange(valueId: string) {
    const nextSecond = valueStatements.find((value) => value.id === valueId) ?? null;

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
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">New Job Choice Vignette</h1>
        <p className="mt-1 text-sm text-white/50">
          Creates an A/B pair with swapped value presentation order.
        </p>
      </div>

      {loadingError != null && <ErrorMessage message={loadingError} />}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">Domain</label>
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

        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">Context</label>
          <select
            value={selectedContextId}
            onChange={(event) => setSelectedContextId(event.target.value)}
            disabled={selectedDomainId === ''}
            className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
          >
            <option value="">Select a context...</option>
            {contexts.map((context) => (
              <option key={context.id} value={context.id}>
                {context.text.slice(0, 80)}
                {context.text.length > 80 ? '...' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">First Value</label>
          <select
            value={selectedValueFirstId}
            onChange={(event) => handleValueFirstChange(event.target.value)}
            disabled={selectedDomainId === ''}
            className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
          >
            <option value="">Select first value...</option>
            {valueStatements.map((value) => (
              <option key={value.id} value={value.id}>
                [{value.token}] {value.body.slice(0, 60)}
                {value.body.length > 60 ? '...' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">Second Value</label>
          <select
            value={selectedValueSecondId}
            onChange={(event) => handleValueSecondChange(event.target.value)}
            disabled={selectedValueFirstId === ''}
            className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
          >
            <option value="">Select second value...</option>
            {secondValueOptions.map((value) => (
              <option key={value.id} value={value.id}>
                [{value.token}] {value.body.slice(0, 60)}
                {value.body.length > 60 ? '...' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">Base Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="e.g. achievement vs hedonism"
            className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
          />
          <p className="text-xs text-white/40">Will create &quot;(A)&quot; and &quot;(B)&quot; variants.</p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-white/70">
            Preamble <span className="text-white/30">(optional)</span>
          </label>
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

        {previewText != null && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-white/70">
              Template Preview (A-first)
            </label>
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
  );
}
