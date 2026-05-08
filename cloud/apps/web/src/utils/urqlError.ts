type GraphQLErrorLike = {
  message?: string;
  path?: Array<string | number> | null;
  extensions?: Record<string, unknown> | null;
};

type CombinedErrorLike = {
  message?: string;
  graphQLErrors?: GraphQLErrorLike[];
  networkError?: {
    message?: string;
    response?: {
      status?: number;
      statusText?: string;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function formatContext(context?: Record<string, string | number | boolean | null | undefined>): string {
  if (context == null) return '';

  const parts = Object.entries(context)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function getGraphQLErrorDetails(error: CombinedErrorLike): string | null {
  const firstGraphQLError = error.graphQLErrors?.[0];
  if (firstGraphQLError == null) {
    return null;
  }

  const parts: string[] = [];
  const path = firstGraphQLError.path != null && firstGraphQLError.path.length > 0
    ? firstGraphQLError.path.map((part) => String(part)).join('.')
    : null;
  if (path != null) parts.push(`path=${path}`);

  if (isRecord(firstGraphQLError.extensions)) {
    const code = readString(firstGraphQLError.extensions.code);
    if (code != null) parts.push(`code=${code}`);

    const errorId = readString(firstGraphQLError.extensions.errorId);
    if (errorId != null) parts.push(`errorId=${errorId}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

function getNetworkErrorDetails(error: CombinedErrorLike): string | null {
  const response = error.networkError?.response;
  const status = response?.status;
  const statusText = readString(response?.statusText);
  if (status == null && statusText == null) {
    return null;
  }
  return [status != null ? `status=${status}` : null, statusText != null ? `statusText=${statusText}` : null]
    .filter((part): part is string => part != null)
    .join(', ');
}

export function formatUrqlError(error: unknown, fallback: string): string {
  if (!isRecord(error)) {
    if (error instanceof Error && readString(error.message) != null) {
      return error.message;
    }
    return fallback;
  }

  const combinedError = error as CombinedErrorLike;
  const graphQLErrorDetails = getGraphQLErrorDetails(combinedError);
  const networkErrorDetails = getNetworkErrorDetails(combinedError);
  const detailPrefix = graphQLErrorDetails != null
    ? `${graphQLErrorDetails}`
    : networkErrorDetails != null
      ? `${networkErrorDetails}`
      : null;

  const message = readString(combinedError.message) ?? fallback;
  if (detailPrefix == null) {
    return message;
  }

  return `${message} (${detailPrefix})`;
}

export function formatQueryError(
  queryLabel: string,
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
): string {
  return `${queryLabel} failed${formatContext(context)}: ${formatUrqlError(error, 'Unknown error')}`;
}
