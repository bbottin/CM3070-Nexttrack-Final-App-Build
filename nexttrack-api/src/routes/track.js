// src/routes/track.js

// Import Express to define an HTTP router.
const express = require("express");
const router = express.Router();

// Import the ReccoBeats service helper that resolves a track by ID.
// This handles both Spotify-format IDs and ReccoBeats internal IDs.
const { getTrackById } = require("../services/reccobeats");

// Import the in-memory cache so repeated lookups are fast and to
// avoid hammering external APIs unnecessarily.
const { cache } = require("../cache/memoryCache");

// Local sample dataset used as a fallback when ReccoBeats can't
// resolve the requested track (offline, rate-limited or unknown ID).
const sampleTracks = require("../data/sampleTracks.json");

/**
 * GET /api/track/:id
 * ------------------------------------------------------------
 * Returns detailed metadata for a single track, identified by its
 * ID. The lookup strategy is layered:
 *
 *   1. In-memory cache — fastest; avoids network calls entirely.
 *   2. ReccoBeats API  — primary external source of truth.
 *   3. Sample dataset  — offline fallback for well-known tracks.
 *
 * Route parameter:
 *   - id (string): a Spotify ID, Spotify URI, or ReccoBeats ID.
 *
 * Response:
 *   - 200: the full track object as returned by the resolver.
 *   - 404: no track matched the given ID in any source.
 *   - 500: an unexpected error occurred while resolving the track.
 */
router.get("/:id", async (req, res) => {
  try {
    // Extract the track ID from the URL path.
    const { id } = req.params;

    // -----------------------------------------------------------------
    // STEP 1: Check the in-memory cache.
    // This is the fastest path and is hit for any track looked up
    // recently (either via this endpoint or via the playlist route).
    // -----------------------------------------------------------------
    let track = cache.get(id);

    if (!track) {
      // -----------------------------------------------------------------
      // STEP 2: Try ReccoBeats.
      // Resolves a full track record (title, artist, features, and —
      // when available — a Spotify href used by the frontend player).
      // -----------------------------------------------------------------
      track = await getTrackById(id);
      if (track) {
        // Cache successful lookups so subsequent requests are instant.
        cache.set(id, track);
      } else {
        // -----------------------------------------------------------------
        // STEP 3: Fall back to the local sample dataset.
        // Used when ReccoBeats doesn't know the ID (e.g., during an
        // outage or for niche tracks outside its catalogue).
        // -----------------------------------------------------------------
        track = sampleTracks[id] || null;
        if (track) cache.set(id, track);
      }
    }

    // If none of the sources produced a track, return a 404 with
    // the requested ID so the caller can debug which lookup failed.
    if (!track) {
      return res.status(404).json({
        error: "Track not found",
        id: id,
      });
    }

    // Return the resolved track as JSON.
    res.json(track);
  } catch (error) {
    // Catch-all error handler for unexpected exceptions.
    console.error("Track fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch track",
      details: error.message,
    });
  }
});

// Export the router so it can be mounted in server.js.
module.exports = router;
