// src/routes/search.js

const express = require("express");
const router = express.Router();
const { searchTracksByText } = require("../services/reccobeats");
const { searchTracks: searchLastFm } = require("../services/lastfm");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * GET /api/search
 * Search for tracks using ReccoBeats and Last.fm
 */
router.get("/", async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    console.log(`🔍 Search request received for: "${q}"`);

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error:
          'Please provide a search query (e.g., "Bohemian Rhapsody Queen")',
      });
    }

    let results = [];
    let sources = [];

    // 1. Try ReccoBeats search (using correct endpoint)
    try {
      console.log(`🔍 Attempting ReccoBeats search for: "${q}"`);
      const rbResults = await searchTracksByText(q, limit);

      if (rbResults && rbResults.length > 0) {
        for (const track of rbResults) {
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === track.title.toLowerCase() &&
              r.artist.toLowerCase() === track.artist.toLowerCase(),
          );
          if (!exists) {
            results.push({
              ...track,
              source: "ReccoBeats",
            });
          }
        }
        sources.push("ReccoBeats");
        console.log(`✅ Added ${results.length} tracks from ReccoBeats`);
      }
    } catch (error) {
      console.warn(`⚠️ ReccoBeats search failed:`, error.message);
    }

    // 2. If ReccoBeats returned few results, try Last.fm
    if (results.length < 3) {
      try {
        console.log(`🔍 Attempting Last.fm search for: "${q}"`);
        const lastFmResults = await searchLastFm(q, limit);

        if (lastFmResults && lastFmResults.length > 0) {
          for (const track of lastFmResults) {
            const exists = results.some(
              (r) =>
                r.title.toLowerCase() === track.title.toLowerCase() &&
                r.artist.toLowerCase() === track.artist.toLowerCase(),
            );
            if (!exists) {
              results.push({
                ...track,
                source: "Last.fm",
              });
            }
          }
          sources.push("Last.fm");
          console.log(`✅ Added ${results.length} tracks from Last.fm`);
        }
      } catch (error) {
        console.warn(`⚠️ Last.fm search failed:`, error.message);
      }
    }

    // 3. If still no results, try sample data
    if (results.length === 0) {
      console.log(`🔍 Checking sample data for: "${q}"`);
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

      if (results.length > 0) {
        sources.push("Sample Data");
      }
    }

    console.log(
      `📊 Final results: ${results.length} tracks from: ${sources.join(", ") || "none"}`,
    );

    res.json({
      query: q,
      results: results,
      total: results.length,
      sources: sources,
      message:
        results.length === 0
          ? "No results found. Try a different search term."
          : null,
    });
  } catch (error) {
    console.error("❌ Search route error:", error);
    res.status(500).json({
      error: "Failed to search tracks",
      details: error.message,
    });
  }
});

module.exports = router;
