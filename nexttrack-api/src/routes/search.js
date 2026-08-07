// src/routes/search.js

const express = require("express");
const router = express.Router();
const axios = require("axios");

/**
 * GET /api/search
 * Search for tracks by name/artist
 * Uses multiple sources for better results
 */
router.get("/", async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error:
          'Please provide a search query (e.g., "Bohemian Rhapsody Queen")',
      });
    }

    const results = [];

    // 1. Try MusicBrainz search (free, no auth)
    try {
      const mbResponse = await axios.get(
        "https://musicbrainz.org/ws/2/recording",
        {
          params: {
            query: q,
            fmt: "json",
            limit: limit,
          },
          headers: {
            "User-Agent":
              "NextTrackAPI/1.0 (https://github.com/yourusername/nexttrack)",
          },
          timeout: 5000,
        },
      );

      if (mbResponse.data && mbResponse.data.recordings) {
        for (const recording of mbResponse.data.recordings) {
          const artist = recording["artist-credit"]?.[0]?.name || "Unknown";
          const title = recording.title || "Unknown Title";

          // Generate a Spotify-like ID from MusicBrainz ID
          const id = `mbid:${recording.id}`;

          results.push({
            id: id,
            title: title,
            artist: artist,
            album: recording.releases?.[0]?.title || "Unknown Album",
            year: recording.releases?.[0]?.date?.split("-")[0] || "",
            source: "MusicBrainz",
          });
        }
      }
    } catch (mbError) {
      console.warn("MusicBrainz search failed:", mbError.message);
    }

    // 2. Try ReccoBeats search (if available)
    try {
      const rbResponse = await axios.get("https://api.reccobeats.com/search", {
        params: {
          q: q,
          limit: limit,
        },
        timeout: 5000,
      });

      if (rbResponse.data && rbResponse.data.results) {
        for (const item of rbResponse.data.results) {
          // Check if we already have this track
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === item.title?.toLowerCase() &&
              r.artist.toLowerCase() === item.artist?.toLowerCase(),
          );
          if (!exists) {
            results.push({
              id: item.id || `recco:${item.title}`,
              title: item.title || "Unknown",
              artist: item.artist || "Unknown",
              album: item.album || "Unknown Album",
              year: item.year || "",
              source: "ReccoBeats",
            });
          }
        }
      }
    } catch (rbError) {
      console.warn("ReccoBeats search failed:", rbError.message);
    }

    // 3. Fallback: Use sample data for common songs
    if (results.length === 0) {
      const sampleTracks = require("../data/sampleTracks.json");
      const searchLower = q.toLowerCase();

      for (const [id, track] of Object.entries(sampleTracks)) {
        if (
          track.title.toLowerCase().includes(searchLower) ||
          track.artist.toLowerCase().includes(searchLower)
        ) {
          results.push({
            id: id,
            title: track.title,
            artist: track.artist,
            album: track.album || "Unknown Album",
            year: track.year || "",
            source: "Sample Data",
          });
        }
        if (results.length >= limit) break;
      }
    }

    res.json({
      query: q,
      results: results,
      total: results.length,
      sources: {
        musicbrainz: results.some((r) => r.source === "MusicBrainz"),
        reccobeats: results.some((r) => r.source === "ReccoBeats"),
        sample: results.some((r) => r.source === "Sample Data"),
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      error: "Failed to search tracks",
      details: error.message,
    });
  }
});

module.exports = router;
