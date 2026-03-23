const MAX_RAW_SCORE = 20 * 5 + 200 * 0.3 + 20 + 50 * 0.5;

export const calculateLeadScore = ({ rating = 0, reviewCount = 0, hasWebsite = false, distanceMiles = 999 }) => {
  const rawScore =
    rating * 20 +
    Math.min(reviewCount, 200) * 0.3 +
    (hasWebsite ? 20 : 0) +
    Math.max(0, 50 - distanceMiles) * 0.5;

  const normalizedScore = Math.max(0, Math.min(100, (rawScore / MAX_RAW_SCORE) * 100));

  return {
    rawScore,
    normalizedScore: Number(normalizedScore.toFixed(1)),
  };
};

export const getScoreTier = (score) => {
  if (score >= 75) {
    return 'high';
  }

  if (score >= 45) {
    return 'medium';
  }

  return 'low';
};
