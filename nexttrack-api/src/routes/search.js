// src/routes/search.js

// Import Express to define an HTTP router.
const express = require("express");
const router = express.Router();

// Import the "smart" text-search function from the ReccoBeats wrapper.
// "Smart" here means it handles sanitisation, retries, and other
// subtle behaviours internally — the route just calls it with a query.
const { searchTracksByTextSmart } = require("../services/reccobeats");

// Import the Last.fm search function (aliased to searchLastFm to
// distinguish it from the ReccoBeats search at the call site).
const { searchTracks: searchLastFm } = require("../services/lastfm");

// Local sample dataset used as a final fallback when both external
// search sources fail or return nothing.
const sampleTracks = require("../data/sampleTracks.json");

/**
 * GET /api/search
 * ------------------------------------------------------------
 * Unified search endpoint. Takes a free-text query and returns
 * matching tracks, drawing from multiple sources in order of
 * preference:
 *
 *   1. ReccoBeats  — preferred because its results carry the
 *                    audio-feature data our recommendation engine
 *                    needs, and its IDs map cleanly to Spotify.
 *   2. Last.fm     — broader coverage for niche or new releases;
 *                    used when ReccoBeats returns too few results.
 *   3. Sample data — final offline fallback for well-known tracks.
 *
 * Query parameters:
 *   - q     (required): the search string (e.g., "Bohemian Rhapsody Queen")
 *   - limit (optional, default 10): maximum number of results to return
 *
 * Response shape:
 *   { query, results: [...], total, sources: [...], message }
 */
router.get("/", async (req, res) => {
  try {
    // Extract query parameters. `limit` defaults to 10 if not provided.
    const { q, limit = 10 } = req.query;

    console.log(`🔍 Search request received for: "${q}"`);

    // Validate: reject very short queries, which return too many
    // results and are usually typos in progress (e.g., a single letter).
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error:
          'Please provide a search query (e.g., "Bohemian Rhapsody Queen")',
      });
    }

    // Accumulators for the final response.
    let results = [];
    let sources = [];

    // -----------------------------------------------------------------
    // SOURCE 1: ReccoBeats
    // Preferred source. Its results carry the audio-feature data our
    // recommendation engine needs and its track IDs map to Spotify
    // IDs, so tracks sourced here will generally be playable.
    // -----------------------------------------------------------------
    try {
      console.log(`🔍 Attempting ReccoBeats search for: "${q}"`);
      const rbResults = await searchTracksByTextSmart(q, limit);

      if (rbResults && rbResults.length > 0) {
        for (const track of rbResults) {
          // Deduplicate against anything already added — protects
          // against the same track coming back from multiple sources.
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === track.title.toLowerCase() &&
              r.artist.toLowerCase() === track.artist.toLowerCase(),
          );
          if (!exists) {
            // Tag the source so the UI can display where each result
            // came from and so downstream code can make informed choices.
            results.push({
              ...track,
              source: "ReccoBeats",
            });
          }
        }
        // Track which sources contributed for the response metadata.
        sources.push("ReccoBeats");
        console.log(`✅ Added ${results.length} tracks from ReccoBeats`);
      }
    } catch (error) {
      // Non-fatal: fall through to Last.fm below.
      console.warn(`⚠️ ReccoBeats search failed:`, error.message);
    }

    // -----------------------------------------------------------------
    // SOURCE 2: Last.fm
    // Only queried if ReccoBeats returned fewer than 3 results —
    // this avoids unnecessary API calls when ReccoBeats already has
    // good coverage, but broadens the net for niche or new releases.
    // -----------------------------------------------------------------
    if (results.length < 3) {
      try {
        console.log(`🔍 Attempting Last.fm search for: "${q}"`);
        const lastFmResults = await searchLastFm(q, limit);

        if (lastFmResults && lastFmResults.length > 0) {
          for (const track of lastFmResults) {
            // Same deduplication check as above — Last.fm often
            // returns tracks that also appear in ReccoBeats results.
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

    // -----------------------------------------------------------------
    // SOURCE 3: Sample data
    // Final fallback, only used when both external APIs returned
    // nothing. Ensures the search box never appears completely
    // broken during API outages or rate-limiting.
    // -----------------------------------------------------------------
    if (results.length === 0) {
      console.log(`🔍 Checking sample data for: "${q}"`);
      const searchLower = q.toLowerCase();

      for (const [id, track] of Object.entries(sampleTracks)) {
        // Substring match against both title and artist — deliberately
        // lenient so partial queries still resolve.
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
        // Stop once the requested limit has been reached.
        if (results.length >= limit) break;
      }

      if (results.length > 0) {
        sources.push("Sample Data");
      }
    }

    // Log the final summary — useful for debugging in development.
    console.log(
      `📊 Final results: ${results.length} tracks from: ${sources.join(", ") || "none"}`,
    );

    // Build the response payload.
    res.json({
      query: q,
      results: results,
      total: results.length,
      // Which sources actually contributed results for transparency.
      sources: sources,
      // Only present when no results were found at all — helps the
      // frontend distinguish "empty success" from an error.
      message:
        results.length === 0
          ? "No results found. Try a different search term."
          : null,
    });
  } catch (error) {
    // Catch-all error handler for unexpected exceptions in the route.
    console.error("❌ Search route error:", error);
    res.status(500).json({
      error: "Failed to search tracks",
      details: error.message,
    });
  }
});

// Export the router so it can be mounted in server.js.
module.exports = router;
