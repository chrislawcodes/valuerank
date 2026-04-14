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

      // Format datetime in PT, replacing colons with dashes for filename safety
      // e.g. "2026-04-13 14-32-05"
      const ptDateTime = new Date()
        .toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' })
        .replace(/:/g, '-');
      // Strip characters invalid in filenames (keep spaces, dashes, alphanumeric)
      const safeDomainName = domain.name.replace(/[/\\:*?"<>|]/g, '_');
      const filename = `${safeDomainName} domain export - ${ptDateTime}.csv`;

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
