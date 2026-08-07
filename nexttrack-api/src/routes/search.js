// src/routes/search.js

const express = require("express");
const router = express.Router();
const { searchTracks: searchLastFm } = require("../services/lastfm");
const { searchTracks: searchSpotify } = require("../services/spotify");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * Try to find a Spotify ID for a track using the Spotify search
 * This helps map Last.fm results to Spotify IDs
 */
async function findSpotifyId(title, artist) {
  try {
    const query = `${title} ${artist}`;
    const results = await searchSpotify(query, 3);
    if (results && results.length > 0) {
      // Find the best match (exact title match preferred)
      const exactMatch = results.find(
        (r) =>
          r.title.toLowerCase() === title.toLowerCase() &&
          r.artist.toLowerCase() === artist.toLowerCase(),
      );
      if (exactMatch) return exactMatch.id;

      // Otherwise take the first result
      return results[0].id;
    }
    return null;
  } catch (error) {
    console.warn(
      `Failed to find Spotify ID for "${title} - ${artist}":`,
      error.message,
    );
    return null;
  }
}

/**
 * GET /api/search
 * Search for tracks by name/artist using Last.fm (free)
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

    // 1. Try Last.fm first (FREE, no Premium required!)
    try {
      console.log(`🔍 Attempting Last.fm search for: "${q}"`);
      const lastFmResults = await searchLastFm(q, limit);

      if (lastFmResults && lastFmResults.length > 0) {
        let mappedCount = 0;

        for (const track of lastFmResults) {
          // Check if we already have this track
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === track.title.toLowerCase() &&
              r.artist.toLowerCase() === track.artist.toLowerCase(),
          );
          if (!exists) {
            // Try to find a Spotify ID for this track
            let spotifyId = null;
            let source = "Last.fm";

            // Check sample data first (fastest)
            for (const [id, sample] of Object.entries(sampleTracks)) {
              if (
                sample.title.toLowerCase() === track.title.toLowerCase() &&
                sample.artist.toLowerCase() === track.artist.toLowerCase()
              ) {
                spotifyId = id;
                source = "Sample (matched)";
                break;
              }
            }

            // If not in sample data, try Spotify search
            if (!spotifyId) {
              const foundId = await findSpotifyId(track.title, track.artist);
              if (foundId) {
                spotifyId = foundId;
                source = "Spotify (mapped)";
                mappedCount++;
              }
            }

            // If we found a Spotify ID, use it
            if (spotifyId) {
              // Check if this track exists in sample data to get audio features
              let album = track.album || "Unknown";
              let year = track.year || "";

              for (const [id, sample] of Object.entries(sampleTracks)) {
                if (
                  id === spotifyId ||
                  (sample.title.toLowerCase() === track.title.toLowerCase() &&
                    sample.artist.toLowerCase() === track.artist.toLowerCase())
                ) {
                  album = sample.album || album;
                  year = sample.year || year;
                  break;
                }
              }

              results.push({
                id: spotifyId, // Use Spotify ID!
                title: track.title,
                artist: track.artist,
                album: album,
                year: year,
                image: track.image,
                source: source,
              });
            } else {
              // No Spotify ID found - still add but mark it
              results.push({
                id: track.id, // Use Last.fm ID as fallback
                title: track.title,
                artist: track.artist,
                album: track.album || "Unknown",
                year: track.year || "",
                image: track.image,
                source: "Last.fm (no Spotify ID)",
                needsMapping: true,
              });
            }
          }
        }

        sources.push("Last.fm");
        console.log(
          `✅ Added ${results.length} tracks from Last.fm (${mappedCount} mapped to Spotify IDs)`,
        );
      } else {
        console.log(`⚠️ Last.fm returned no results for "${q}"`);
      }
    } catch (error) {
      console.error(`❌ Last.fm search failed:`, error.message);
    }

    // 2. If we have few results, try sample data as well
    if (results.length < 3) {
      console.log(`🔍 Checking sample data for additional matches: "${q}"`);
      const searchLower = q.toLowerCase();

      for (const [id, track] of Object.entries(sampleTracks)) {
        if (
          track.title.toLowerCase().includes(searchLower) ||
          track.artist.toLowerCase().includes(searchLower)
        ) {
          const exists = results.some(
            (r) =>
              r.title.toLowerCase() === track.title.toLowerCase() &&
              r.artist.toLowerCase() === track.artist.toLowerCase(),
          );
          if (!exists) {
            results.push({
              id: id,
              title: track.title,
              artist: track.artist,
              album: track.album || "Unknown Album",
              year: track.year || "",
              image: track.image || null,
              source: "Sample Data",
            });
          }
        }
        if (results.length >= limit) break;
      }

      if (results.length > 0 && !sources.includes("Sample Data")) {
        sources.push("Sample Data");
      }
    }

    // Sort results: prefer tracks with Spotify IDs
    results.sort((a, b) => {
      const aHasSpotify =
        a.id && !a.id.startsWith("lastfm:") && !a.id.startsWith("lastfm");
      const bHasSpotify =
        b.id && !b.id.startsWith("lastfm:") && !b.id.startsWith("lastfm");
      if (aHasSpotify && !bHasSpotify) return -1;
      if (!aHasSpotify && bHasSpotify) return 1;
      return 0;
    });

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
