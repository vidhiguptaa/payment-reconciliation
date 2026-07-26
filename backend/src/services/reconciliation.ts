import { PaymentImage, StatementTransaction } from '@prisma/client';
import { MatchStatus, MatchType } from '../shared/types';
import { prisma } from '../db';

export interface ScoreResult {
  totalScore: number;
  fieldScores: Record<string, number>;
  reasons: string[];
}

export interface MatchDecision {
  matchStatus: MatchStatus;
  bestStatementTransaction: StatementTransaction | null;
  confidenceScore: number;
  reasons: string[];
  fieldScores: Record<string, number>;
}

// Config weights identical to rules.py
const WEIGHTS = {
  WEIGHT_REF_EXACT: 60.0,
  WEIGHT_UTR_EXACT: 60.0,
  WEIGHT_TXN_ID_EXACT: 50.0,
  WEIGHT_AMOUNT_EXACT: 25.0,
  WEIGHT_AMOUNT_TOLERANCE: 20.0, // within ±1.0
  WEIGHT_DATE_EXACT: 10.0,
  WEIGHT_DATE_TOLERANCE: 5.0,    // within ±1 day
  WEIGHT_BENEFICIARY_MAX: 10.0,  // up to 10 based on fuzzy ratio
  WEIGHT_SENDER_MAX: 5.0,        // up to 5 based on fuzzy ratio
  WEIGHT_TXN_TYPE_MATCH: 5.0,
};

const THRESHOLDS = {
  THRESHOLD_MATCHED: 90.0,
  THRESHOLD_POSSIBLE_MATCH: 70.0,
};

/**
 * Calculates character bigram similarity (Sorensen-Dice coefficient)
 */
function charRatio(s1: string, s2: string): number {
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1.0 : 0.0;
  
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };
  
  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  
  let intersectionCount = 0;
  b1.forEach(bg => {
    if (b2.has(bg)) intersectionCount++;
  });
  
  return (2 * intersectionCount) / (b1.size + b2.size);
}

/**
 * Calculates fuzzy token intersection ratio
 */
export function fuzzyRatio(s1: string, s2: string): number {
  if (!s1 || !s2) return 0.0;
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (!str1 || !str2) return 0.0;

  if (str1.includes(str2) || str2.includes(str1)) return 1.0;

  const words1 = str1.match(/\w+/g) || [];
  const words2 = str2.match(/\w+/g) || [];
  
  const stopWords = new Set([
    'pvt', 'ltd', 'inc', 'corp', 'co', 'limited', 'upi', 
    'imps', 'neft', 'rtgs', 'ach', 'transfer', 'pay', 'vendor'
  ]);

  const w1Clean = words1.filter(w => !stopWords.has(w));
  const w2Clean = words2.filter(w => !stopWords.has(w));

  if (w1Clean.length && w2Clean.length) {
    const w1Set = new Set(w1Clean);
    const overlap = w2Clean.filter(w => w1Set.has(w));
    if (overlap.length) {
      const tokenRatio = overlap.length / Math.min(w1Clean.length, w2Clean.length);
      const charSimilarity = charRatio(str1, str2);
      return Math.max(charSimilarity, tokenRatio);
    }
  }

  return charRatio(str1, str2);
}

export class ReconciliationScorer {
  static parseDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr.trim());
    return isNaN(d.getTime()) ? null : d;
  }

  static calculateScore(extracted: PaymentImage, statement: StatementTransaction): ScoreResult {
    const fieldScores: Record<string, number> = {};
    const reasons: string[] = [];
    let totalScore = 0.0;

    // 1. Reference / UTR Number Exact Matching
    const extRef = (extracted.referenceNumber || '').trim();
    const extUtr = (extracted.utrNumber || '').trim();
    const extId = (extracted.transactionId || '').trim();

    const stmtRef = (statement.referenceNumber || '').trim();
    const stmtUtr = (statement.utrNumber || '').trim();
    const stmtId = (statement.transactionId || '').trim();
    const stmtDesc = (statement.description || '').trim();

    let refMatched = false;
    
    if (extRef && (extRef === stmtRef || extRef === stmtUtr || extRef === stmtId || stmtDesc.includes(extRef))) {
      const score = WEIGHTS.WEIGHT_REF_EXACT;
      fieldScores['referenceNumber'] = score;
      totalScore += score;
      reasons.push(`Exact Reference Number match (${extRef})`);
      refMatched = true;
    }

    if (!refMatched && extUtr && (extUtr === stmtUtr || extUtr === stmtRef || extUtr === stmtId || stmtDesc.includes(extUtr))) {
      const score = WEIGHTS.WEIGHT_UTR_EXACT;
      fieldScores['utrNumber'] = score;
      totalScore += score;
      reasons.push(`Exact UTR match (${extUtr})`);
      refMatched = true;
    }

    if (!refMatched && extId && (extId === stmtId || stmtDesc.includes(extId))) {
      const score = WEIGHTS.WEIGHT_TXN_ID_EXACT;
      fieldScores['transactionId'] = score;
      totalScore += score;
      reasons.push(`Exact Transaction ID match (${extId})`);
      refMatched = true;
    }

    // Fuzzy matching for Reference Number if no exact matches found
    if (!refMatched && extRef && extRef.length >= 6) {
      // Find potential codes in the statement description
      const codes = stmtDesc.match(/\b[A-Za-z0-9]{6,18}\b/g) || [];
      let bestRefRatio = 0.0;
      for (const code of codes) {
        const ratio = charRatio(extRef.toLowerCase(), code.toLowerCase());
        if (ratio > bestRefRatio) {
          bestRefRatio = ratio;
        }
      }

      if (bestRefRatio >= 0.85) {
        const fuzzyScore = Math.round(WEIGHTS.WEIGHT_REF_EXACT * bestRefRatio * 0.7 * 10) / 10;
        fieldScores['referenceNumber'] = fuzzyScore;
        totalScore += fuzzyScore;
        reasons.push(`Fuzzy Reference Number similarity (${Math.round(bestRefRatio * 100)}%)`);
      }
    }

    // 2. Amount Matching
    const extAmt = extracted.amount;
    const stmtAmt = statement.amount; // Signed amount, or absolute in credit/debit

    if (extAmt !== null && extAmt !== undefined && stmtAmt !== null && stmtAmt !== undefined) {
      const extAbs = Math.abs(extAmt);
      const stmtAbs = Math.abs(stmtAmt);
      const diff = Math.abs(extAbs - stmtAbs);

      if (diff < 0.01) {
        const score = WEIGHTS.WEIGHT_AMOUNT_EXACT;
        fieldScores['amount'] = score;
        totalScore += score;
        reasons.push(`Exact Amount match (₹${extAbs.toFixed(2)})`);
      } else if (diff <= 1.0) {
        const score = WEIGHTS.WEIGHT_AMOUNT_TOLERANCE;
        fieldScores['amount'] = score;
        totalScore += score;
        reasons.push(`Amount within ₹1.00 tolerance (Diff: ₹${diff.toFixed(2)})`);
      }
    }

    // 3. Date Matching
    const extDate = this.parseDate(extracted.transactionDate);
    const stmtDate = this.parseDate(statement.transactionDate);

    if (extDate && stmtDate) {
      const timeDiff = Math.abs(extDate.getTime() - stmtDate.getTime());
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        const score = WEIGHTS.WEIGHT_DATE_EXACT;
        fieldScores['date'] = score;
        totalScore += score;
        reasons.push('Same Transaction Date');
      } else if (daysDiff <= 1) {
        const score = WEIGHTS.WEIGHT_DATE_TOLERANCE;
        fieldScores['date'] = score;
        totalScore += score;
        reasons.push('Date within ±1 day tolerance');
      }
    }

    // 4. Beneficiary / Receiver Similarity
    const recName = (extracted.receiverName || '').trim();
    if (recName && stmtDesc) {
      const ratio = fuzzyRatio(recName, stmtDesc);
      if (ratio >= 0.5) {
        const benScore = Math.round(WEIGHTS.WEIGHT_BENEFICIARY_MAX * ratio * 10) / 10;
        fieldScores['beneficiary'] = benScore;
        totalScore += benScore;
        reasons.push(`Beneficiary similarity (${Math.round(ratio * 100)}%)`);
      }
    }

    // 5. Sender Similarity
    const sendName = (extracted.senderName || '').trim();
    if (sendName && stmtDesc) {
      const ratio = fuzzyRatio(sendName, stmtDesc);
      if (ratio >= 0.5) {
        const sendScore = Math.round(WEIGHTS.WEIGHT_SENDER_MAX * ratio * 10) / 10;
        fieldScores['sender'] = sendScore;
        totalScore += sendScore;
        reasons.push(`Sender similarity (${Math.round(ratio * 100)}%)`);
      }
    }

    // 6. Transaction Type matching
    const extType = (extracted.transactionType || '').trim().toLowerCase();
    if (extType && stmtDesc) {
      if (stmtDesc.toLowerCase().includes(extType)) {
        const score = WEIGHTS.WEIGHT_TXN_TYPE_MATCH;
        fieldScores['transactionType'] = score;
        totalScore += score;
        reasons.push(`Transaction Type match (${extracted.transactionType})`);
      }
    }

    const finalScore = Math.min(100.0, Math.round(totalScore * 10) / 10);

    return {
      totalScore: finalScore,
      fieldScores,
      reasons,
    };
  }
}

export class ReconciliationEngine {
  /**
   * Matches a single extracted payment image transaction against all statement transaction candidates.
   */
  static matchTransaction(extracted: PaymentImage, candidates: StatementTransaction[]): MatchDecision {
    if (candidates.length === 0) {
      return {
        matchStatus: MatchStatus.UNMATCHED,
        bestStatementTransaction: null,
        confidenceScore: 0.0,
        reasons: ['No bank statement transactions imported yet.'],
        fieldScores: {},
      };
    }

    const scoredCandidates: Array<{ transaction: StatementTransaction; result: ScoreResult }> = [];

    for (const candidate of candidates) {
      const scoreRes = ReconciliationScorer.calculateScore(extracted, candidate);
      if (scoreRes.totalScore >= THRESHOLDS.THRESHOLD_POSSIBLE_MATCH) {
        scoredCandidates.push({ transaction: candidate, result: scoreRes });
      }
    }

    if (scoredCandidates.length === 0) {
      return {
        matchStatus: MatchStatus.UNMATCHED,
        bestStatementTransaction: null,
        confidenceScore: 0.0,
        reasons: [`No matching statement transactions found above possible match threshold (${THRESHOLDS.THRESHOLD_POSSIBLE_MATCH}%).`],
        fieldScores: {},
      };
    }

    // Sort by total score descending
    scoredCandidates.sort((a, b) => b.result.totalScore - a.result.totalScore);

    const topCandidate = scoredCandidates[0].transaction;
    const topScoreRes = scoredCandidates[0].result;

    // Check for collision: multiple candidates scoring above matched threshold (90%)
    const highMatchCandidates = scoredCandidates.filter(c => c.result.totalScore >= THRESHOLDS.THRESHOLD_MATCHED);

    if (highMatchCandidates.length > 1) {
      const collisionReasons = [
        `Multiple (${highMatchCandidates.length}) statement candidates score above ${THRESHOLDS.THRESHOLD_MATCHED}%. Requires human review.`
      ].concat(topScoreRes.reasons);

      return {
        matchStatus: MatchStatus.NEEDS_REVIEW,
        bestStatementTransaction: topCandidate,
        confidenceScore: topScoreRes.totalScore,
        reasons: collisionReasons,
        fieldScores: topScoreRes.fieldScores,
      };
    }

    if (topScoreRes.totalScore >= THRESHOLDS.THRESHOLD_MATCHED) {
      return {
        matchStatus: MatchStatus.MATCHED,
        bestStatementTransaction: topCandidate,
        confidenceScore: topScoreRes.totalScore,
        reasons: topScoreRes.reasons,
        fieldScores: topScoreRes.fieldScores,
      };
    }

    // Possible match (70% - 89.9%)
    return {
      matchStatus: MatchStatus.POSSIBLE_MATCH,
      bestStatementTransaction: topCandidate,
      confidenceScore: topScoreRes.totalScore,
      reasons: topScoreRes.reasons,
      fieldScores: topScoreRes.fieldScores,
    };
  }

  /**
   * Runs batch reconciliation on all processed payment images and active statement transactions for a user.
   */
  static async runBatch(userId: string, reportName: string) {
    console.log(`Running reconciliation batch for user: ${userId}...`);
    // 1. Fetch all processed payment images that belong to the user
    const paymentImages = await prisma.paymentImage.findMany({
      where: { userId, status: 'PROCESSED' },
    });

    // 2. Fetch all statement transactions for the user
    const statementTransactions = await prisma.statementTransaction.findMany({
      where: {
        statementFile: {
          userId,
        },
      },
    });

    const matchesToCreate: any[] = [];
    let matchedCount = 0;
    let possibleCount = 0;
    let needsReviewCount = 0;
    let unmatchedCount = 0;

    for (const image of paymentImages) {
      const decision = this.matchTransaction(image, statementTransactions);

      if (decision.matchStatus === MatchStatus.MATCHED) matchedCount++;
      else if (decision.matchStatus === MatchStatus.POSSIBLE_MATCH) possibleCount++;
      else if (decision.matchStatus === MatchStatus.NEEDS_REVIEW) needsReviewCount++;
      else unmatchedCount++;

      matchesToCreate.push({
        paymentImageId: image.id,
        statementTransactionId: decision.bestStatementTransaction?.id || null,
        matchStatus: decision.matchStatus,
        matchType: MatchType.AUTO_MATCHED,
        confidenceScore: decision.confidenceScore,
        matchReasonJson: JSON.stringify(decision.reasons),
        fieldScoresJson: JSON.stringify(decision.fieldScores),
      });
    }

    // 3. Create the ReconciliationReport
    console.log(`Generating report ${reportName}...`);
    const report = await prisma.reconciliationReport.create({
      data: {
        name: reportName,
        userId,
        matchedCount,
        possibleCount,
        needsReviewCount,
        unmatchedCount,
        totalCount: paymentImages.length,
      },
    });

    // 4. Save matches linked to the report
    if (matchesToCreate.length > 0) {
      const dataWithReportId = matchesToCreate.map(m => ({
        ...m,
        reportId: report.id,
      }));

      await prisma.reconciliationMatch.createMany({
        data: dataWithReportId,
      });
    }

    console.log(`Report saved. ID: ${report.id}`);
    return report;
  }
}
