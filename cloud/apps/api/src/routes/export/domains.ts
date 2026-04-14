import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { createLogger, AuthenticationError, NotFoundError } from '@valuerank/shared';

import { getDomainCSVHeader, formatDomainCSVRow, iterateDomainCsvTranscriptPages } from '../../services/export/domain-csv.js';
import { resolveDomainSignatureRunIds } from '../../services/domain.js';

const log = createLogger('export:domains');

export const domainsExportRouter = Router();

/**
 * GET /api/export/domains/:id/transcripts.csv
 *
 * Download all analyzable transcripts for a domain scoped to the selected
 * signature (or the default vnew signature if omitted).
 *
 * Includes all models and all latest-vignette runs matching the signature.
 * Streams the response to handle large exports.
 *
 * Requires authentication.
 */
domainsExportRouter.get(
  '/domains/:id/transcripts.csv',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = req.params.id;
      if (domainId === undefined || domainId === null || domainId === '') {
        throw new NotFoundError('Domain', 'missing');
      }

      const signature = typeof req.query.signature === 'string' && req.query.signature.trim() !== ''
        ? req.query.signature.trim()
        : null;

      log.info(
        { userId: req.user.id, domainId, signature },
        'Exporting domain transcripts as CSV',
      );

      const resolved = await resolveDomainSignatureRunIds(domainId, signature);
      if (!resolved) {
        throw new NotFoundError('Domain', domainId);
      }

      const { domain, filteredSourceRunIds, resolvedSignature } = resolved;

      const safeName = domain.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
      const date = new Date().toISOString().slice(0, 10);
      const filename = resolvedSignature !== null
        ? `domain-${safeName}-${resolvedSignature.replace(/[^a-z0-9-]/gi, '_').toLowerCase()}-transcripts-${date}.csv`
        : `domain-${safeName}-transcripts-${date}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.write('\uFEFF');
      res.write(getDomainCSVHeader());
      let rowsWritten = 0;

      for await (const transcripts of iterateDomainCsvTranscriptPages(filteredSourceRunIds)) {
        for (const transcript of transcripts) {
          res.write('\n');
          res.write(formatDomainCSVRow(transcript));
          rowsWritten += 1;
        }
      }

      log.info(
        { domainId, rowsWritten, resolvedSignature },
        'Domain CSV export complete',
      );

      res.end();
    } catch (err) {
      next(err);
    }
  }
);
