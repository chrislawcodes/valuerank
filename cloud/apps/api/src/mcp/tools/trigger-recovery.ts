/**
 * trigger_recovery MCP Tool [T012-T014]
 *
 * Triggers system-wide recovery scan for orphaned runs.
 * Detects and recovers all runs stuck in RUNNING/SUMMARIZING state
 * with no active jobs in the queue.
 */

import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import { recoverOrphanedRuns } from '../../services/run/recovery.js';
import { logAuditEvent } from '../../services/mcp/index.js';
import { formatError, formatSuccess, createOperationsAudit } from './helpers.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:trigger-recovery');

/**
 * Input schema for trigger_recovery tool (no parameters required)
 */
const TriggerRecoveryInputSchema = {};

/**
 * Registers the trigger_recovery tool on the MCP server
 */
function registerTriggerRecoveryTool(server: McpServer): void {
  log.info('Registering trigger_recovery tool');

  server.registerTool(
    'trigger_recovery',
    {
      description: `Trigger system-wide recovery scan for orphaned runs.

**What this tool does:**
1. Scans for runs stuck in RUNNING or SUMMARIZING state
2. Checks if they have no pending/active jobs (orphaned)
3. Re-queues missing jobs for each orphaned run
4. Reports results for all recovered runs

**When to use:**
- After an API restart when runs may have been interrupted
- When multiple runs are stuck and need recovery
- As part of incident response procedures
- For scheduled health checks

**Criteria for orphaned runs:**
- Status is RUNNING or SUMMARIZING
- No pending or active jobs in PgBoss queue
- Progress shows incomplete (completed + failed < total)
- Last update was more than 5 minutes ago

**Returns:**
- detected_count: Number of orphaned runs found
- recovered_count: Number of runs successfully recovered
- recovered_runs: List of recovered runs with actions taken
- errors: Any errors encountered during recovery

**Note:** This is safe to call multiple times. It only affects runs that are actually stuck.`,
      inputSchema: TriggerRecoveryInputSchema,
    },
    async (_args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({ requestId }, 'trigger_recovery called');

      try {
        const result = await recoverOrphanedRuns();

        log.info({
          requestId,
          detectedCount: result.detected.length,
          recoveredCount: result.recovered.length,
          errorCount: result.errors.length,
        }, 'System recovery completed');

        // Log audit event
        logAuditEvent(
          createOperationsAudit({
            action: 'trigger_recovery',
            userId,
            runId: 'system', // System-wide operation
            requestId,
            details: {
              detectedCount: result.detected.length,
              recoveredCount: result.recovered.length,
              errorCount: result.errors.length,
              recoveredRunIds: result.recovered.map(r => r.runId),
            },
          })
        );

        return formatSuccess({
          success: true,
          detected_count: result.detected.length,
          recovered_count: result.recovered.length,
          recovered_runs: result.recovered.map(r => ({
            run_id: r.runId,
            action: r.action,
            requeued_count: r.requeuedCount ?? 0,
          })),
          errors: result.errors.map(e => ({
            run_id: e.runId,
            error: e.error,
          })),
        });
      } catch (err) {
        log.error({ err, requestId }, 'trigger_recovery failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to trigger system recovery'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerTriggerRecoveryTool);

export { registerTriggerRecoveryTool };
