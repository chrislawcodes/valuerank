/**
 * JSON-RPC 2.0 Error Response Helpers
 *
 * All responses from the MCP endpoint must be valid JSON-RPC 2.0.
 * Anthropic's MCP proxy expects this format — returning plain JSON
 * causes "Invalid content from server" errors that break the session.
 *
 * JSON-RPC 2.0 error codes:
 *   -32700  Parse error
 *   -32600  Invalid Request
 *   -32601  Method not found
 *   -32602  Invalid params
 *   -32603  Internal error
 *   -32000 to -32099  Server error (reserved for implementation-defined errors)
 *
 * Custom codes used here:
 *   -32029  Rate limit exceeded
 *   -32001  Authentication required
 */

/**
 * JSON-RPC 2.0 error response object.
 */
export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: unknown;
};

/**
 * Build a JSON-RPC 2.0 error response.
 *
 * @param code - Integer error code (use standard JSON-RPC codes or -32000..-32099 for custom)
 * @param message - Human-readable error description
 * @param id - The request ID from the client (null if unknown)
 * @param data - Optional additional error data
 */
export function jsonRpcError(
  code: number,
  message: string,
  id: unknown = null,
  data?: unknown
): JsonRpcErrorResponse {
  const error: JsonRpcErrorResponse['error'] = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: '2.0',
    error,
    id,
  };
}
