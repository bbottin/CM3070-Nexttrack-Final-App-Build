// src/routes/search.js
//
// GET /api/search - free-text search used by the frontend's seed-track
// picker (TrackInput.js). Tries three sources in order, stopping as soon as
// enough results are found: ReccoBeats -> Last.fm (only if ReccoBeats
// returned fewer than 3) -> local sampleTracks.json (only if nothing at
// all was found). Results from different sources are merged and
// deduplicated by exact (title, artist) match.

const express = require("express");
const router = express.Router();
const { searchTracksByTextSmart } = require("../services/reccobeats");
const { searchTracks: searchLastFm } = require("../services/lastfm");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * GET /api/search?q=<query>&limit=<n>
 * Search for tracks across ReccoBeats, Last.fm, and local sample data.
 * `q` must be at least 2 characters. Returns { query, results, total,
 * sources, message }.
 */
router.get("/", async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    console.log(`🔍 Search request received for: "${q}"`);

    // Reject short queries - they return too many results and are
    // usually typos in progress (e.g. a single letter).
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
    // Preferred source. Its results carry audio-feature data and its
    // IDs map cleanly to Spotify, so tracks sourced here are usually
    // playable. Uses the "smart" wrapper (which cross-validates
    // combined-query results - see services/reccobeats.js) rather
    // than the raw text-search primitive.
    // -----------------------------------------------------------------
    try {
      console.log(`🔍 Attempting ReccoBeats search for: "${q}"`);
      const rbResults = await searchTracksByTextSmart(q, limit);

      if (rbResults && rbResults.length > 0) {
        for (const track of rbResults) {
          // Deduplicate against anything already added - protects
          // against the same track coming back from multiple sources.
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === track.title.toLowerCase() &&
              r.artist.toLowerCase() === track.artist.toLowerCase(),
          );
          if (!exists) {
            results.push({
              ...track,
              source: "ReccoBeats",
              // track.verified is set by searchTracksByTextSmart (true
              // only for cross-validated matches - see reccobeats.js).
              // Default to false if for any reason it's missing, so the
              // frontend never shows unwarranted confidence.
              verified: track.verified === true,
            });
          }
        }
        sources.push("ReccoBeats");
        console.log(`✅ Added ${results.length} tracks from ReccoBeats`);
      }
    } catch (error) {
      // Non-fatal: the code falls through to the Last.fm block below.
      console.warn(`⚠️ ReccoBeats search failed:`, error.message);
    }

    // -----------------------------------------------------------------
    // SOURCE 2: Last.fm
    // Only queried when ReccoBeats returned fewer than 3 results -
    // this avoids unnecessary API calls when ReccoBeats already has
    // good coverage, but broadens the net for niche or new releases.
    //
    // Note: Last.fm-sourced tracks carry the "lastfm:Title|Artist"
    // id format when they have no MBID - see services/lastfm.js for
    // why that matters downstream in playlist.js's seed resolution.
    // -----------------------------------------------------------------
    if (results.length < 3) {
      try {
        console.log(`🔍 Attempting Last.fm search for: "${q}"`);
        const lastFmResults = await searchLastFm(q, limit);

        if (lastFmResults && lastFmResults.length > 0) {
          for (const track of lastFmResults) {
            // Same deduplication check as above - Last.fm often
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
                // Last.fm's text search is crowd-sourced and noisy
                // (see services/lastfm.js) - never mark it verified.
                verified: false,
              });
            }
          }
          sources.push("Last.fm");
          console.log(`✅ Added ${results.length} tracks from Last.fm`);
        }
      } catch (error) {
        // Non-fatal: falls through to the sample-data block below.
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
        // Substring match against both title and artist - deliberately
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
            // This is the project's own curated dataset - a substring
            // match here is as trustworthy as any result gets.
            verified: true,
          });
        }
        // Stop once the requested limit is reached.
        if (results.length >= limit) break;
      }

      if (results.length > 0) {
        sources.push("Sample Data");
      }
    }

    // Log the final summary - useful for debugging in development.
    console.log(
      `📊 Final results: ${results.length} tracks from: ${sources.join(", ") || "none"}`,
    );

    // Build the response payload.
    res.json({
      query: q,
      results: results,
      total: results.length,
      // Which sources actually contributed results, for transparency.
      sources: sources,
      // Only present when no results were found at all - helps the
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

module.exports = router;
