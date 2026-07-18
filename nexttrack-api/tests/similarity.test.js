// tests/similarity.test.js

const {
  cosineSimilarity,
  extractFeatureVector,
  computeScore,
} = require("../src/services/similarity");

console.log("🧪 Running Similarity Tests...\n");

// Test 1: Cosine Similarity
console.log("Test 1: Cosine Similarity");
const vecA = [1, 0, 0];
const vecB = [0.8, 0.2, 0.1];
const vecC = [0, 1, 0];
console.log(
  `  Similarity([1,0,0], [0.8,0.2,0.1]) = ${cosineSimilarity(vecA, vecB).toFixed(3)} (should be > 0.7)`,
);
console.log(
  `  Similarity([1,0,0], [0,1,0]) = ${cosineSimilarity(vecA, vecC).toFixed(3)} (should be 0)\n`,
);

// Test 2: Feature Extraction
console.log("Test 2: Feature Extraction");
const track = {
  energy: 0.85,
  valence: 0.75,
  tempo: 121,
  danceability: 0.7,
  acousticness: 0.3,
};
const vector = extractFeatureVector(track);
console.log(
  `  Extracted vector: [${vector.map((v) => v.toFixed(3)).join(", ")}]\n`,
);

// Test 3: Compute Score
console.log("Test 3: Compute Score");
const candidate = {
  id: "test1",
  title: "Test Track",
  artist: "Test Artist",
  genre: "electronic",
  energy: 0.85,
  valence: 0.75,
  tempo: 121,
  danceability: 0.7,
  acousticness: 0.3,
  popularity: 0.5,
};
const context = {
  energy: 0.8,
  valence: 0.7,
  tempo: 120,
  danceability: 0.65,
  acousticness: 0.35,
  genre: "electronic",
};
const preferences = { discovery: 0.5, mood: "happy" };

const result = computeScore(candidate, context, preferences);
console.log(`  Score: ${result.score.toFixed(3)}`);
console.log(`  Reason: ${result.reason}\n`);

// Test 4: Different Genre
console.log("Test 4: Different Genre");
const candidate2 = {
  ...candidate,
  id: "test2",
  title: "Jazz Track",
  genre: "jazz",
  energy: 0.4,
  valence: 0.6,
  tempo: 100,
};
const result2 = computeScore(candidate2, context, preferences);
console.log(`  Score (jazz): ${result2.score.toFixed(3)}`);
console.log(`  Reason: ${result2.reason}\n`);

console.log("✅ All tests complete.");
