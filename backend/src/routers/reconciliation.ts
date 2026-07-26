import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../db';
import { ReconciliationEngine } from '../services/reconciliation';
import { MatchStatus, MatchType } from '../shared/types';

const router = Router();

/**
 * Re-calculate and update reconciliation report statistics.
 */
async function updateReportStatistics(reportId: string) {
  const matches = await prisma.reconciliationMatch.findMany({
    where: { reportId },
  });

  let matchedCount = 0;
  let possibleCount = 0;
  let needsReviewCount = 0;
  let unmatchedCount = 0;

  for (const m of matches) {
    if (m.matchStatus === MatchStatus.MATCHED) matchedCount++;
    else if (m.matchStatus === MatchStatus.POSSIBLE_MATCH) possibleCount++;
    else if (m.matchStatus === MatchStatus.NEEDS_REVIEW) needsReviewCount++;
    else unmatchedCount++;
  }

  await prisma.reconciliationReport.update({
    where: { id: reportId },
    data: {
      matchedCount,
      possibleCount,
      needsReviewCount,
      unmatchedCount,
      totalCount: matches.length,
    },
  });
}

/**
 * Handler to run batch reconciliation and generate a new report.
 */
const runHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { name } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const reportName = name ? String(name).trim() : `Reconciliation Run - ${timestamp}`;

    // Verify there are statement transactions imported
    const transactionsCount = await prisma.statementTransaction.count({
      where: { statementFile: { userId } },
    });

    if (transactionsCount === 0) {
      return res.status(400).json({
        error: 'Cannot run reconciliation: No bank statements have been imported yet.',
      });
    }

    // Verify there are processed payment screenshots
    const imagesCount = await prisma.paymentImage.count({
      where: { userId, status: 'PROCESSED' },
    });

    if (imagesCount === 0) {
      return res.status(400).json({
        error: 'Cannot run reconciliation: No processed payment screenshots found. Ensure screenshots are uploaded and processed.',
      });
    }

    const report = await ReconciliationEngine.runBatch(userId, reportName);

    return res.json(report);
  } catch (error: any) {
    console.error('Run reconciliation error:', error);
    return res.status(500).json({ error: 'Failed to run reconciliation batch' });
  }
};

router.post('/run', requireAuth, runHandler);
router.post('/reconcile', requireAuth, runHandler);

/**
 * List all reconciliation reports for the user.
 */
router.get('/reports', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const reports = await prisma.reconciliationReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(reports);
  } catch (error: any) {
    console.error('Fetch reports error:', error);
    return res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

/**
 * Retrieve detailed analysis metrics of a specific report.
 */
router.get('/reports/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const report = await prisma.reconciliationReport.findFirst({
      where: { id, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // 1. Fetch matches linked to the report
    const matches = await prisma.reconciliationMatch.findMany({
      where: { reportId: id },
      include: {
        paymentImage: true,
        statementTransaction: true,
      },
    });

    // 2. Fetch all statement transactions imported by this user
    const allStatementTxs = await prisma.statementTransaction.findMany({
      where: {
        statementFile: { userId },
      },
    });

    // 3. Find unmatched/extra bank statement transactions
    // Defined as: transactions that are not currently matched/linked to any successful matches in this report
    const matchedStatementTxIds = new Set(
      matches
        .filter((m: any) => m.statementTransactionId !== null && m.matchStatus !== MatchStatus.UNMATCHED)
        .map((m: any) => m.statementTransactionId as string)
    );

    const unmatchedTransactions = allStatementTxs.filter(
      (tx: any) => !matchedStatementTxIds.has(tx.id)
    );

    // 4. Find unmatched payment images in this report
    // In our model, unmatched images are matches where matchStatus = 'Unmatched' or statementTransactionId = null
    const unmatchedImages = matches
      .filter((m: any) => m.matchStatus === MatchStatus.UNMATCHED || !m.statementTransactionId)
      .map((m: any) => m.paymentImage);

    return res.json({
      report,
      matches,
      unmatchedImages,
      unmatchedTransactions,
    });
  } catch (error: any) {
    console.error('Fetch report detail error:', error);
    return res.status(500).json({ error: 'Failed to retrieve report detail' });
  }
});

/**
 * Delete a report.
 */
router.delete('/reports/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const report = await prisma.reconciliationReport.findFirst({
      where: { id, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Delete report (cascades matches)
    await prisma.reconciliationReport.delete({
      where: { id },
    });

    return res.json({ message: 'Report deleted successfully' });
  } catch (error: any) {
    console.error('Delete report error:', error);
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

/**
 * Perform manual reconciliation match lock override.
 */
router.post('/matches/:matchId/manual', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { matchId } = req.params;
  const { statementTransactionId } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  if (!statementTransactionId) {
    return res.status(400).json({ error: 'Statement transaction ID is required' });
  }

  try {
    // Verify the match belongs to this user
    const match = await prisma.reconciliationMatch.findFirst({
      where: {
        id: matchId,
        report: { userId },
      },
      include: {
        paymentImage: true,
      },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match record not found' });
    }

    // Verify the target statement transaction exists
    const statementTx = await prisma.statementTransaction.findFirst({
      where: {
        id: statementTransactionId,
        statementFile: { userId },
      },
    });

    if (!statementTx) {
      return res.status(404).json({ error: 'Statement transaction not found' });
    }

    // Update match attributes
    const updatedMatch = await prisma.reconciliationMatch.update({
      where: { id: matchId },
      data: {
        statementTransactionId,
        matchStatus: MatchStatus.MATCHED,
        matchType: MatchType.MANUALLY_MATCHED,
        confidenceScore: 100.0,
        matchReasonJson: JSON.stringify(['Manually matched by administrator']),
        fieldScoresJson: JSON.stringify({}),
      },
      include: {
        paymentImage: true,
        statementTransaction: true,
      },
    });

    // Update the report counts
    await updateReportStatistics(match.reportId);

    return res.json(updatedMatch);
  } catch (error: any) {
    console.error('Manual match error:', error);
    return res.status(500).json({ error: 'Failed to apply manual match' });
  }
});

/**
 * Reject match recommendation (de-couple and mark Unmatched).
 */
router.post('/matches/:matchId/reject', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { matchId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    // Verify the match belongs to this user
    const match = await prisma.reconciliationMatch.findFirst({
      where: {
        id: matchId,
        report: { userId },
      },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match record not found' });
    }

    // Decouple match attributes
    const updatedMatch = await prisma.reconciliationMatch.update({
      where: { id: matchId },
      data: {
        statementTransactionId: null,
        matchStatus: MatchStatus.UNMATCHED,
        matchType: MatchType.MANUALLY_MATCHED,
        confidenceScore: 0.0,
        matchReasonJson: JSON.stringify(['Rejected by administrator']),
        fieldScoresJson: JSON.stringify({}),
      },
      include: {
        paymentImage: true,
        statementTransaction: true,
      },
    });

    // Update the report counts
    await updateReportStatistics(match.reportId);

    return res.json(updatedMatch);
  } catch (error: any) {
    console.error('Reject match error:', error);
    return res.status(500).json({ error: 'Failed to reject match' });
  }
});

export default router;
