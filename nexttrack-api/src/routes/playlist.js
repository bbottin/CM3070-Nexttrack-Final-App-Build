// src/routes/playlist.js

const express = require("express");
const router = express.Router();
const { fetchTrackFeatures } = require("../services/reccobeats");
const { computeScore } = require("../services/similarity");
const { cache } = require("../cache/memoryCache");
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * POST /api/playlist
 * Generate a full playlist
 */
router.post("/", async (req, res) => {
  try {
    const { seed_tracks, preferences = {}, playlist_length = 10 } = req.body;

    // Validate input
    if (!seed_tracks || !Array.isArray(seed_tracks) || seed_tracks.length < 1) {
      return res.status(400).json({
        error:
          'Please provide at least 1 seed track in the "seed_tracks" array',
      });
    }

    // 1. Fetch features for seed tracks
    const seedData = [];
    const missingIds = [];

    for (const id of seed_tracks) {
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
        seedData.push(track);
      } else {
        missingIds.push(id);
      }
    }

    if (seedData.length === 0) {
      return res.status(404).json({
        error: "No valid seed tracks found. Please check your track IDs.",
        invalid_ids: missingIds,
      });
    }

    // 2. Compute average features of seed tracks
    const avgFeatures = {
      energy:
        seedData.reduce((s, t) => s + (t.energy || 0.5), 0) / seedData.length,
      valence:
        seedData.reduce((s, t) => s + (t.valence || 0.5), 0) / seedData.length,
      tempo:
        seedData.reduce((s, t) => s + (t.tempo || 120), 0) / seedData.length,
      danceability:
        seedData.reduce((s, t) => s + (t.danceability || 0.5), 0) /
        seedData.length,
      acousticness:
        seedData.reduce((s, t) => s + (t.acousticness || 0.5), 0) /
        seedData.length,
      genre: seedData.map((t) => t.genre).filter(Boolean)[0] || "pop",
    };

    // 3. Build candidate list (exclude seed tracks)
    let candidates = [];
    const seedIds = new Set(seed_tracks);

    // From cache (recently fetched tracks)
    const cacheKeys = cache.stats().keys || [];
    for (const key of cacheKeys) {
      if (!seedIds.has(key)) {
        const cached = cache.get(key);
        if (cached) candidates.push(cached);
      }
    }

    // From sample data
    for (const [id, track] of Object.entries(sampleTracks)) {
      if (!seedIds.has(id) && !candidates.find((c) => c.id === id)) {
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

    // 5. Sort and select top N
    scored.sort((a, b) => b.score - a.score);

    // Get unique tracks (by title + artist to avoid duplicates)
    const uniqueTracks = [];
    const seen = new Set();
    for (const track of scored) {
      const key = `${track.title}|${track.artist}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTracks.push(track);
      }
      if (uniqueTracks.length >= playlist_length) break;
    }

    if (uniqueTracks.length === 0) {
      return res.status(404).json({
        error: "No candidates available for playlist generation",
      });
    }

    // 6. Fetch YouTube links for each track
    const playlist = [];
    for (const track of uniqueTracks) {
      let youtube = null;
      const searchQuery = `${track.title} ${track.artist} official audio`;
      const results = await searchYouTube(searchQuery, 1);
      if (results && results.length > 0 && results[0].videoId) {
        youtube = {
          videoId: results[0].videoId,
          embedUrl: getYouTubeEmbedUrl(results[0].videoId),
          thumbnail: results[0].thumbnail,
          title: results[0].title,
        };
      }

      playlist.push({
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          genre: track.genre,
          year: track.year,
        },
        score: track.score,
        reason: track.reason,
        youtube: youtube,
      });
    }

    res.json({
      playlist: playlist,
      total: playlist.length,
      seed_tracks: seedData.map((t) => `${t.title} - ${t.artist}`),
      preferences: preferences,
    });
  } catch (error) {
    console.error("Playlist generation error:", error);
    res.status(500).json({
      error: "Failed to generate playlist",
      details: error.message,
    });
  }
});

module.exports = router;
