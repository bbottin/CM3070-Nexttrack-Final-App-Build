// src/services/similarity.js

/**
 * cosineSimilarity
 * ------------------------------------------------------------
 * Compute the cosine similarity between two feature vectors.
 *
 * Cosine similarity measures the angle between two vectors in
 * n-dimensional space, ranging from 0 (orthogonal, completely
 * dissimilar) to 1 (identical direction, perfectly aligned).
 *
 * Unlike Euclidean distance, cosine similarity is magnitude-invariant:
 * two tracks with the same relative proportions of energy/valence/etc.
 * will score as highly similar even if their absolute values differ.
 * This is desirable for music recommendation — a quieter track with
 * the same "shape" should still count as similar.
 *
 * @param {Array<number>} vecA - First feature vector
 * @param {Array<number>} vecB - Second feature vector
 * @returns {number} Similarity score between 0 and 1
 */
function cosineSimilarity(vecA, vecB) {
  // Guard: reject null/undefined vectors or ones of mismatched length.
  // Returning 0 means "no similarity", which is safer than throwing
  // and lets the caller continue.
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  // Accumulate the dot product (A · B) and the squared magnitudes
  // (||A||² and ||B||²) in a single pass for efficiency — O(n) time.
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  // Guard: if either vector has zero magnitude, the cosine formula
  // would divide by zero. Return 0 for safety.
  if (magA === 0 || magB === 0) return 0;

  // Final formula: cos(A, B) = (A · B) / (||A|| × ||B||)
  // Where ||A|| = sqrt(magA) and ||B|| = sqrt(magB).
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * extractFeatureVector
 * ------------------------------------------------------------
 * Convert a track object into a numeric feature vector suitable
 * for cosine similarity.
 *
 * The track is expected to have five audio features. Each feature
 * is placed into a fixed position in the vector — the ORDER MUST
 * MATCH between candidate and context vectors, otherwise the
 * similarity calculation compares apples to oranges.
 *
 * Special handling:
 *   - Tempo is expressed in BPM (typically 60–200), but all other
 *     features are already on a 0–1 scale. Without normalisation,
 *     tempo would dominate the similarity calculation purely
 *     because of its larger magnitude. Divide by 200 (the
 *     expected upper bound) to bring it into a comparable range.
 *   - Missing features default to 0.5 (neutral) rather than 0 or
 *     undefined, so partial data degrades gracefully instead of
 *     biasing the score towards extremes.
 *
 * @param {Object} track - Track object with audio features
 * @param {Array<string>} features - Names of features to extract,
 *                                   in the order they should appear
 * @returns {Array<number>} A numeric vector of the same length as `features`
 */
function extractFeatureVector(
  track,
  features = ["energy", "valence", "tempo", "danceability", "acousticness"],
) {
  const vector = [];

  for (const feature of features) {
    let value = track[feature];

    // Normalise tempo from BPM to 0–1 by capping at 200 BPM.
    // `Math.min` clamps values above 200 to 1.0, preventing
    // unusually fast tracks from skewing the vector.
    if (feature === "tempo" && value) {
      value = Math.min(value / 200, 1);
    }

    // Fall back to the neutral midpoint (0.5) when a feature is
    // missing, null, or zero-falsy. This keeps the vector length
    // consistent across all tracks.
    vector.push(value || 0.5);
  }

  return vector;
}

/**
 * computeScore
 * ------------------------------------------------------------
 * Compute a weighted recommendation score for a candidate track
 * relative to the user's listening context and generate a
 * human-readable explanation of the result.
 *
 * The score is a linear combination of three signals:
 *
 *   1. Feature similarity (weight 0.5)
 *      Cosine similarity of the five audio feature vectors.
 *      Primary signal — captures acoustic compatibility.
 *
 *   2. Genre match (weight 0.3)
 *      Binary indicator: 1.0 if the candidate's genre matches the
 *      context genre, 0.0 otherwise. Adds stylistic coherence.
 *
 *   3. Discovery factor (weight 0.2)
 *      Reflects the user's preference for novelty via an inverse
 *      popularity calculation. User-controllable.
 *
 * The weights were chosen through iterative testing:
 *   - Feature similarity dominates because it's the most direct
 *     measure of acoustic compatibility.
 *   - Genre is a secondary signal because genres are coarse and
 *     can be misleading (e.g., "rock" spans many subgenres).
 *   - Discovery is a light touch so the user preference nudges
 *     rather than overrides the acoustic signal.
 *
 * @param {Object} candidate   - Candidate track with audio features
 * @param {Object} context     - Average feature vector of the input sequence
 * @param {Object} preferences - User preferences ({ mood, discovery })
 * @returns {Object} { score: number, reason: string }
 */
function computeScore(candidate, context, preferences = {}) {
  // Convert both tracks into comparable feature vectors.
  const candidateVec = extractFeatureVector(candidate);
  const contextVec = extractFeatureVector(context);

  // ---- Component 1: Feature similarity (weight 0.5) ----
  // The core acoustic signal. Ranges from 0 to 1.
  const featureSim = cosineSimilarity(candidateVec, contextVec);

  // ---- Component 2: Genre overlap (weight 0.3) ----
  // Case-insensitive exact match. Binary: either 1.0 or 0.0.
  // Note: this is deliberately simple. A more nuanced approach
  // (e.g., genre embeddings) would avoid losing information for
  // tracks that are stylistically adjacent but not identically
  // labelled.
  const genreMatch =
    candidate.genre &&
    context.genre &&
    candidate.genre.toLowerCase() === context.genre.toLowerCase()
      ? 1.0
      : 0.0;

  // ---- Component 3: Discovery factor (weight 0.2) ----
  // Inverse popularity scaled by the user's discovery preference.
  // When discovery = 1, less-popular tracks are boosted.
  // When discovery = 0, the component becomes a constant (1 - 0 = 1)
  // and has no effect on ranking.
  const discovery = preferences.discovery || 0.5;
  const popularity = candidate.popularity || 0.5;
  // Higher discovery = favour less popular tracks
  const discoveryScore = 1 - popularity * discovery;

  // ---- Weighted total ----
  // Sum of the three signals scaled by their respective weights.
  const totalScore = featureSim * 0.5 + genreMatch * 0.3 + discoveryScore * 0.2;

  // ---- Explanation generation ----
  // Build a list of reasons based on which components contributed
  // meaningfully to the final score. Thresholds are heuristics:
  // 0.7 for similarity/discovery means "clearly a strong signal";
  // 0.5 for genre just means "matched".
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

  // Pick the final reason string. Preference is:
  //   1. A specific explanation based on what actually contributed.
  //   2. A mood-based explanation if no component was strong enough.
  //   3. A generic fallback so the field is never empty.
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

// Export the public API of this module.
module.exports = {
  cosineSimilarity,
  extractFeatureVector,
  computeScore,
};
