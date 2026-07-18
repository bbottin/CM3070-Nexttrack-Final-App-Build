// src/services/similarity.js

/**
 * Calculate cosine similarity between two feature vectors
 * @param {Array<number>} vecA - First feature vector
 * @param {Array<number>} vecB - Second feature vector
 * @returns {number} Similarity score between 0 and 1
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Extract feature vector from a track object
 * @param {Object} track - Track with audio features
 * @param {Array<string>} features - Feature names to extract
 * @returns {Array<number>} Feature vector
 */
function extractFeatureVector(
  track,
  features = ["energy", "valence", "tempo", "danceability", "acousticness"],
) {
  const vector = [];
  for (const feature of features) {
    let value = track[feature];
    // Normalize tempo (typically 60-200 BPM, normalize to 0-1)
    if (feature === "tempo" && value) {
      value = Math.min(value / 200, 1);
    }
    vector.push(value || 0.5);
  }
  return vector;
}

/**
 * Compute weighted recommendation score
 * @param {Object} candidate - Candidate track with features
 * @param {Object} context - Average features of input sequence
 * @param {Object} preferences - User preference parameters
 * @returns {Object} { score, reason }
 */
function computeScore(candidate, context, preferences = {}) {
  // Extract feature vectors
  const candidateVec = extractFeatureVector(candidate);
  const contextVec = extractFeatureVector(context);

  // 1. Feature similarity (weight: 0.5)
  const featureSim = cosineSimilarity(candidateVec, contextVec);

  // 2. Genre overlap (weight: 0.3)
  const genreMatch =
    candidate.genre &&
    context.genre &&
    candidate.genre.toLowerCase() === context.genre.toLowerCase()
      ? 1.0
      : 0.0;

  // 3. Discovery factor (weight: 0.2)
  const discovery = preferences.discovery || 0.5;
  const popularity = candidate.popularity || 0.5;
  // Higher discovery = favour less popular tracks
  const discoveryScore = 1 - popularity * discovery;

  // Weighted total
  const totalScore = featureSim * 0.5 + genreMatch * 0.3 + discoveryScore * 0.2;

  // Generate explanation
  const reasons = [];
  if (featureSim > 0.7) {
    reasons.push(
      `similar energy and tempo (${(featureSim * 100).toFixed(0)}% match)`,
    );
  }
  if (genreMatch > 0.5) {
    reasons.push(`same genre (${candidate.genre})`);
  }
  if (discoveryScore > 0.7) {
    reasons.push(`fresh discovery based on your preference`);
  }

  let reason;
  if (reasons.length > 0) {
    reason = `Recommended because: ${reasons.join(", ")}.`;
  } else if (preferences.mood) {
    reason = `Based on your mood preference (${preferences.mood}).`;
  } else {
    reason = "Recommended based on audio similarity.";
  }

  return { score: totalScore, reason };
}

module.exports = {
  cosineSimilarity,
  extractFeatureVector,
  computeScore,
};
