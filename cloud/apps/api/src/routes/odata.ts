/**
 * OData Routes
 *
 * Minimal OData v4-compatible endpoints for Excel integration.
 * Excel can connect via Data → Get Data → From OData Feed.
 *
 * GET /api/odata/runs/:id - Service document for run
 * GET /api/odata/runs/:id/$metadata - Metadata document
 * GET /api/odata/runs/:id/Transcripts - Transcript data as OData
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import { createLogger, AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';

const log = createLogger('odata');

export const odataRouter = Router();

/**
 * Set common OData response headers.
 */
function setODataHeaders(res: Response): void {
  res.setHeader('OData-Version', '4.0');
  res.setHeader('Content-Type', 'application/json;odata.metadata=minimal;charset=utf-8');
}

/**
 * GET /api/odata/runs/:id
 *
 * OData service document - lists available entity sets.
 */
odataRouter.get(
  '/runs/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (req.user === null || req.user === undefined) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      // Verify run exists
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true },
      });

      if (run === null) {
        throw new NotFoundError('Run', runId);
      }

      const baseUrl = `${req.protocol}://${req.get('host')}/api/odata/runs/${runId}`;

      setODataHeaders(res);
      res.json({
        '@odata.context': `${baseUrl}/$metadata`,
        value: [
          {
            name: 'Transcripts',
            kind: 'EntitySet',
            url: 'Transcripts',
          },
        ],
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Extract dimension names from a definition's content.
 * Returns unique dimension names found in the dimensions array.
 */
function extractDimensionNames(content: unknown): string[] {
  if (content === null || content === undefined || typeof content !== 'object') {
    return [];
  }

  const typedContent = content as { dimensions?: Array<{ name?: string }> };
  const dimensions = typedContent.dimensions;

  if (!Array.isArray(dimensions)) {
    return [];
  }

  const names = dimensions
    .map((d) => d?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  // Deduplicate dimension names
  return Array.from(new Set(names));
}

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * GET /api/odata/runs/:id/$metadata
 *
 * OData metadata document in CSDL XML format.
 * Excel requires XML metadata, not JSON.
 *
 * Dynamically includes dimension columns based on the run's definition.
 */
odataRouter.get(
  '/runs/:id/\\$metadata',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (req.user === null || req.user === undefined) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      // Fetch run with its definition to get dimension names
      const run = await db.run.findUnique({
        where: { id: runId },
        select: {
          id: true,
          definition: {
            select: { content: true },
          },
        },
      });

      if (run === null) {
        throw new NotFoundError('Run', runId);
      }

      // Extract dimension names from the definition content
      // Guard against missing definition relation (shouldn't happen but be defensive)
      const dimensionNames = run.definition !== null && run.definition !== undefined
        ? extractDimensionNames(run.definition.content)
        : [];

      log.debug({ runId, dimensionNames }, 'Generating OData metadata with dimensions');

      // Generate dimension property declarations for the metadata
      const dimensionProperties = dimensionNames
        .map((name) => `        <Property Name="${escapeXml(name)}" Type="Edm.Int32"/>`)
        .join('\n');

      // Return CSDL XML metadata (required by Excel)
      res.setHeader('OData-Version', '4.0');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');

      const metadata = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="ValueRank" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Transcript" OpenType="true">
        <Key>
          <PropertyRef Name="id"/>
        </Key>
        <Property Name="id" Type="Edm.String" Nullable="false"/>
        <Property Name="modelId" Type="Edm.String" Nullable="false"/>
        <Property Name="modelVersion" Type="Edm.String"/>
        <Property Name="scenarioId" Type="Edm.String" Nullable="false"/>
        <Property Name="scenarioName" Type="Edm.String"/>
        <Property Name="sampleIndex" Type="Edm.Int32" Nullable="false"/>
        <Property Name="decisionCode" Type="Edm.String"/>
        <Property Name="decisionText" Type="Edm.String"/>
        <Property Name="turnCount" Type="Edm.Int32"/>
        <Property Name="tokenCount" Type="Edm.Int32"/>
        <Property Name="durationMs" Type="Edm.Int32"/>
        <Property Name="estimatedCost" Type="Edm.Decimal"/>
        <Property Name="createdAt" Type="Edm.DateTimeOffset" Nullable="false"/>
${dimensionProperties}
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="Transcripts" EntityType="ValueRank.Transcript"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

      res.send(metadata);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/odata/runs/:id/Transcripts
 *
 * OData entity set - returns transcript data for the run.
 * This is the main data endpoint that Excel consumes.
 *
 * Supports basic OData query options:
 * - $top: Limit number of results
 * - $skip: Skip first N results
 * - $orderby: Sort results
 * - $select: Choose which fields to return
 * - $filter: Filter results (limited support)
 */
odataRouter.get(
  '/runs/:id/Transcripts',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (req.user === null || req.user === undefined) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'OData Transcripts request');

      // Verify run exists and check status
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true },
      });

      if (run === null) {
        throw new NotFoundError('Run', runId);
      }

      // Require COMPLETED status for export
      if (run.status !== 'COMPLETED') {
        throw new ValidationError(
          `Run must be in COMPLETED status for OData access. Current status: ${run.status}`
        );
      }

      // Parse OData query options
      const top = (typeof req.query.$top === 'string' && req.query.$top !== '') ? parseInt(req.query.$top, 10) : undefined;
      const skip = (typeof req.query.$skip === 'string' && req.query.$skip !== '') ? parseInt(req.query.$skip, 10) : undefined;
      const orderby = req.query.$orderby as string | undefined;
      const selectParam = req.query.$select as string | undefined;

      // Build orderBy clause
      type OrderByClause = { modelId?: 'asc' | 'desc'; scenarioId?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc'; sampleIndex?: 'asc' | 'desc' };
      let orderBy: OrderByClause[] = [{ modelId: 'asc' }, { scenarioId: 'asc' }, { sampleIndex: 'asc' }];

      if (typeof orderby === 'string' && orderby !== '') {
        const parts = orderby.split(' ');
        const field = parts[0];
        const direction = parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc';

        // Map OData field names to Prisma field names
        const fieldMap: Record<string, keyof OrderByClause> = {
          modelId: 'modelId',
          scenarioId: 'scenarioId',
          createdAt: 'createdAt',
          sampleIndex: 'sampleIndex',
        };

        if (field !== undefined && field !== null && field !== '' && fieldMap[field] !== undefined) {
          orderBy = [{ [fieldMap[field]]: direction } as OrderByClause];
        }
      }

      // Get total count for @odata.count
      const totalCount = await db.transcript.count({
        where: { runId },
      });

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: { runId },
        include: { scenario: true },
        orderBy,
        take: top,
        skip,
      });

      log.info({ runId, transcriptCount: transcripts.length, total: totalCount }, 'OData Transcripts fetched');

      // Parse select fields if provided
      const selectFields = (typeof selectParam === 'string' && selectParam !== '') ? selectParam.split(',').map((s) => s.trim()) : null;

      // Transform to OData format
      const baseUrl = `${req.protocol}://${req.get('host')}/api/odata/runs/${runId}`;

      // Build value array with dimension columns dynamically
      const value = transcripts.map((t) => {
        // Extract dimensions from scenario content
        const content = t.scenario?.content as { dimensions?: Record<string, number> } | null;
        const dimensions = (content !== null && content !== undefined && content.dimensions !== undefined && content.dimensions !== null) ? content.dimensions : {};

        // Base transcript data
        const baseData: Record<string, unknown> = {
          id: t.id,
          modelId: t.modelId,
          modelVersion: t.modelVersion,
          scenarioId: t.scenarioId,
          scenarioName: t.scenario?.name ?? null,
          sampleIndex: t.sampleIndex ?? 0,
          decisionCode: t.decisionCode,
          decisionText: t.decisionText,
          turnCount: t.turnCount,
          tokenCount: t.tokenCount,
          durationMs: t.durationMs,
          estimatedCost: (t.estimatedCost !== null && t.estimatedCost !== undefined) ? Number(t.estimatedCost) : null,
          createdAt: t.createdAt.toISOString(),
        };

        // Add dimension columns
        for (const [key, val] of Object.entries(dimensions)) {
          baseData[key] = val;
        }

        // Apply $select if provided
        if (selectFields !== null) {
          const filtered: Record<string, unknown> = {};
          for (const field of selectFields) {
            if (field in baseData) {
              filtered[field] = baseData[field];
            }
          }
          return filtered;
        }

        return baseData;
      });

      setODataHeaders(res);
      res.json({
        '@odata.context': `${baseUrl}/$metadata#Transcripts`,
        '@odata.count': totalCount,
        value,
      });
    } catch (err) {
      next(err);
    }
  }
);
