// src/routes/recommend.js

const express = require("express");
const router = express.Router();
const { fetchTrackFeatures } = require("../services/reccobeats");
const { computeScore } = require("../services/similarity");
const { cache } = require("../cache/memoryCache");
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * POST /api/recommend
 * Get a next track recommendation with YouTube info
 */
router.post("/", async (req, res) => {
  try {
    const { track_ids, preferences = {} } = req.body;

    // Validate input
    if (!track_ids || !Array.isArray(track_ids) || track_ids.length < 2) {
      return res.status(400).json({
        error: 'Please provide at least 2 track IDs in the "track_ids" array',
      });
    }

    // 1. Fetch features for each input track
    const tracks = [];
    const missingIds = [];

    for (const id of track_ids) {
      let track = cache.get(id);

      if (!track) {
        // Try to fetch from ReccoBeats
        track = await fetchTrackFeatures(id);
        if (track) {
          cache.set(id, track);
        } else {
          // Fallback to sample data
          track = sampleTracks[id] || null;
          if (track) cache.set(id, track);
        }
      }

      if (track) {
        tracks.push(track);
      } else {
        missingIds.push(id);
      }
    }

    if (tracks.length === 0) {
      return res.status(404).json({
        error: "No valid tracks found. Please check your track IDs.",
        invalid_ids: missingIds,
      });
    }

    // 2. Compute average feature vector of input sequence
    const avgFeatures = {
      energy: tracks.reduce((s, t) => s + (t.energy || 0.5), 0) / tracks.length,
      valence:
        tracks.reduce((s, t) => s + (t.valence || 0.5), 0) / tracks.length,
      tempo: tracks.reduce((s, t) => s + (t.tempo || 120), 0) / tracks.length,
      danceability:
        tracks.reduce((s, t) => s + (t.danceability || 0.5), 0) / tracks.length,
      acousticness:
        tracks.reduce((s, t) => s + (t.acousticness || 0.5), 0) / tracks.length,
      genre: tracks.map((t) => t.genre).filter(Boolean)[0] || "pop",
    };

    // 3. Build candidate list (exclude input tracks)
    let candidates = [];

    // From cache (recently fetched tracks)
    const cacheKeys = cache.stats().keys || [];
    for (const key of cacheKeys) {
      if (!track_ids.includes(key)) {
        const cached = cache.get(key);
        if (cached) candidates.push(cached);
      }
    }

    // From sample data
    for (const [id, track] of Object.entries(sampleTracks)) {
      if (!track_ids.includes(id) && !candidates.find((c) => c.id === id)) {
        candidates.push({ ...track, id });
      }
    }

    // 4. Score each candidate
    const scored = candidates.map((candidate) => {
      const { score, reason } = computeScore(
        candidate,
        avgFeatures,
        preferences,
      );
      return { ...candidate, score, reason };
    });

    // 5. Sort and return best match
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return res.status(404).json({
        error: "No candidates available for recommendation",
      });
    }

    const best = scored[0];

    // 6. Search YouTube for the recommended track
    let youtube = null;
    if (best) {
      const searchQuery = `${best.title} ${best.artist} official audio`;
      const results = await searchYouTube(searchQuery, 1);
      if (results && results.length > 0 && results[0].videoId) {
        youtube = {
          videoId: results[0].videoId,
          embedUrl: getYouTubeEmbedUrl(results[0].videoId),
          thumbnail: results[0].thumbnail,
          title: results[0].title,
        };
      }
    }

    // 7. Build response with YouTube info
    res.json({
      track: {
        id: best.id,
        title: best.title,
        artist: best.artist,
        album: best.album,
        genre: best.genre,
        year: best.year,
        features: {
          energy: best.energy,
          valence: best.valence,
          tempo: best.tempo,
        },
      },
      reason: best.reason,
      score: parseFloat(best.score.toFixed(3)),
      youtube: youtube,
      candidates_considered: scored.length,
      input_tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
      })),
    });
  } catch (error) {
    console.error("Recommendation error:", error);
    res.status(500).json({
      error: "Failed to generate recommendation",
      details: error.message,
    });
  }
});

module.exports = router;
