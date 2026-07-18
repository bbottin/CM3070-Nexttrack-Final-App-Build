// src/routes/track.js

const express = require("express");
const router = express.Router();
const { fetchTrackFeatures } = require("../services/reccobeats");
const { cache } = require("../cache/memoryCache");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * GET /api/track/:id
 * Get track details by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check cache first
    let track = cache.get(id);

    if (!track) {
      // Try ReccoBeats
      track = await fetchTrackFeatures(id);
      if (track) {
        cache.set(id, track);
      } else {
        // Fallback to sample data
        track = sampleTracks[id] || null;
        if (track) cache.set(id, track);
      }
    }

    if (!track) {
      return res.status(404).json({
        error: "Track not found",
        id: id,
      });
    }

    res.json(track);
  } catch (error) {
    console.error("Track fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch track",
      details: error.message,
    });
  }
});

module.exports = router;
