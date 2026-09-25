// src/routes/recommend.js

// Import Express to define an HTTP router.
const express = require("express");
const router = express.Router();

// Import service functions from the ReccoBeats wrapper.
// - getRecommendations: fetch recommendations for ReccoBeats IDs
// - searchTrack:        look up a track by Spotify ID
// - extractSpotifyId:   normalise various ID formats to a clean Spotify ID
const {
  getRecommendations,
  searchTrack,
  extractSpotifyId,
} = require("../services/reccobeats");

// YouTube fallback helpers.
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");

// Local sample dataset used as a fallback when external APIs fail.
const sampleTracks = require("../data/sampleTracks.json");

/**
 * formatTrackIdForPlayer
 * ------------------------------------------------------------
 * Resolve a playable `spotify:track:...` URI for a recommendation,
 * or return null if there is no confirmed real Spotify ID for
 * it.
 *
 * WHY THIS EXISTS:
 * This endpoint used to send ReccoBeats' internal UUID (or a
 * sample-data key) straight through as `track.id` with no
 * validation at all. The frontend then handed that ID to the
 * Spotify embed, which is how the "now playing" track could end up
 * completely unrelated to the recommendation being shown — the
 * embed either failed silently or kept playing whatever was
 * previously loaded.
 *
 * Returning null explicitly tells the frontend "we don't have a
 * playable Spotify ID for this — use the YouTube fallback instead".
 */
function formatTrackIdForPlayer(track) {
  // Only proceed if a spotifyId field exists on the track object.
  const spotifyId = track.spotifyId;
  if (!spotifyId) return null;

  // Already a valid Spotify URI → return as-is.
  if (spotifyId.startsWith("spotify:track:")) return spotifyId;

  // Spotify share URL → extract the ID and reformat.
  if (spotifyId.includes("open.spotify.com/track/")) {
    const match = spotifyId.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return `spotify:track:${match[1]}`;
  }

  // Bare 22-character ID → prefix it with the URI scheme.
  if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyId)) {
    return `spotify:track:${spotifyId}`;
  }

  // Unrecognized format → return null so the caller falls back.
  return null;
}

/**
 * POST /api/recommend
 * ------------------------------------------------------------
 * Returns a single "next track" recommendation based on a short
 * sequence of seed tracks and user preferences.
 *
 * Flow:
 *   1. Resolve each input seed to a ReccoBeats ID (or sample data).
 *   2. Ask ReccoBeats for a single recommendation.
 *   3. Fall back to sample data if ReccoBeats fails or returns none.
 *   4. Fetch a YouTube fallback link.
 *   5. Build a response with a properly formatted Spotify URI.
 */
router.post("/", async (req, res) => {
  try {
    const { track_ids, preferences = {} } = req.body;

    // Validate: at least one seed track ID is required.
    if (!track_ids || !Array.isArray(track_ids) || track_ids.length < 1) {
      return res.status(400).json({
        error: 'Please provide at least 1 track ID in the "track_ids" array',
      });
    }

    console.log(`📥 Incoming track_ids:`, track_ids);

    // -----------------------------------------------------------------
    // STEP 1: Convert each input seed (Spotify ID) → ReccoBeats ID.
    //
    // Collect `inputTracks` — an array of { id, title, artist }
    // objects — so the frontend can display what the recommendation
    // was based on. This replaced an earlier version that returned
    // raw ID strings, which crashed the frontend's display logic.
    // -----------------------------------------------------------------
    let reccobeatsIds = [];
    const inputTracks = [];

    for (const id of track_ids) {
      // Normalise the ID to a clean Spotify ID (if possible).
      const cleanId = extractSpotifyId(id);

      // Try to find the track in sample data first, so it can attach
      // a friendly title/artist even if ReccoBeats later fails.
      let trackInfo = null;
      if (sampleTracks[cleanId] || sampleTracks[id]) {
        const track = sampleTracks[cleanId] || sampleTracks[id];
        trackInfo = {
          id: cleanId || id,
          title: track.title,
          artist: track.artist,
        };
      }

      // Try to convert the Spotify ID to a ReccoBeats ID.
      const rbTrack = await searchTrack(cleanId || id);
      if (rbTrack && rbTrack.reccobeatsId) {
        reccobeatsIds.push(rbTrack.reccobeatsId);

        // If it didn't already get title/artist from sample data,
        // use what ReccoBeats returned instead.
        if (!trackInfo) {
          trackInfo = {
            id: cleanId || id,
            title: rbTrack.title || cleanId || id,
            artist: rbTrack.artist || "Unknown",
          };
        }
      }

      // Record whatever is known about this input track.
      if (trackInfo) {
        inputTracks.push(trackInfo);
      } else {
        // Final fallback: use the raw ID as the title so the frontend
        // always has something to display.
        inputTracks.push({
          id: cleanId || id,
          title: cleanId || id,
          artist: "Unknown",
        });
      }
    }

    let recommendation = null;
    let source = "Unknown";

    // -----------------------------------------------------------------
    // STEP 2: Ask ReccoBeats for a recommendation.
    // Only runs if at least one seed was successfully converted.
    // -----------------------------------------------------------------
    if (reccobeatsIds.length > 0) {
      try {
        const recommendations = await getRecommendations(reccobeatsIds, 1, {
          // Optional audio feature filters (may be undefined).
          energy: preferences.energy,
          valence: preferences.valence,
          popularity: preferences.popularity,
        });

        if (recommendations && recommendations.length > 0) {
          // NOTE on field naming:
          // - recommendations[0].spotifyId is the real Spotify ID
          //   (extracted from ReccoBeats' href).
          // - recommendations[0].id is ReccoBeats' own UUID, which is
          //   NOT playable in the Spotify embed.
          // The frontend relies on `spotifyId` being preserved on
          // this object so formatTrackIdForPlayer can use it below.
          recommendation = recommendations[0];
          source = "ReccoBeats";
          console.log(
            `✅ Recommendation from ReccoBeats: ${recommendation.title}`,
          );
        }
      } catch (error) {
        // Non-fatal: falls through to the sample-data fallback below.
        console.error("❌ ReccoBeats recommendation failed:", error.message);
      }
    }

    // -----------------------------------------------------------------
    // STEP 3: Fallback to sample data if ReccoBeats failed or returned
    // nothing. Uses a simple mood-based scoring heuristic.
    // -----------------------------------------------------------------
    if (!recommendation) {
      console.log("🔄 Falling back to sample data for recommendation");

      // Build the candidate pool: all sample tracks except the ones
      // the user has already provided as seeds.
      const candidates = [];
      const inputIds = new Set(
        track_ids.map((id) => extractSpotifyId(id) || id),
      );

      for (const [id, track] of Object.entries(sampleTracks)) {
        // Skip seeds by both raw id and cleaned id.
        if (!inputIds.has(id) && !inputIds.has(extractSpotifyId(id))) {
          candidates.push({ ...track, id });
        }
      }

      // Score candidates using simple mood heuristics.
      const scored = candidates.map((candidate) => {
        let score = 0.5; // neutral baseline
        if (preferences.mood === "energetic" && candidate.energy > 0.7)
          score += 0.3;
        if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
        if (preferences.mood === "happy" && candidate.valence > 0.6)
          score += 0.3;
        if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;
        return { ...candidate, score };
      });

      // Sort descending and pick the top-scoring candidate.
      scored.sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const best = scored[0];
        recommendation = {
          id: best.id,
          spotifyId: best.spotifyId || best.id,
          title: best.title,
          artist: best.artist,
          popularity: best.popularity || 0,
          _score: best.score,
          _source: "Sample Data",
        };
        source = "Sample Data (fallback)";
      }
    }

    if (!recommendation) {
      return res.status(404).json({
        error: "No recommendation found. Try different seed tracks.",
      });
    }

    // -----------------------------------------------------------------
    // STEP 4: Fetch a YouTube fallback link for this track.
    // Some tracks won't have a playable Spotify ID, in which case the
    // frontend will surface the YouTube link instead.
    // -----------------------------------------------------------------
    let youtube = null;
    const searchQuery = `${recommendation.title} ${recommendation.artist} official audio`;
    const results = await searchYouTube(searchQuery, 1);
    if (results && results.length > 0 && results[0].videoId) {
      // Direct video result — build the embed URL.
      youtube = {
        videoId: results[0].videoId,
        embedUrl: getYouTubeEmbedUrl(results[0].videoId),
        thumbnail: results[0].thumbnail,
        title: results[0].title,
      };
    } else if (results && results.length > 0 && results[0].searchUrl) {
      // No direct video, there will still be a search URL to offer.
      youtube = {
        searchUrl: results[0].searchUrl,
        note: results[0].note,
      };
    }

    // -----------------------------------------------------------------
    // STEP 5: Build the final response.
    // -----------------------------------------------------------------
    // Derive a properly formatted Spotify URI (or null if there is
    // no confirmed real Spotify ID for this track).
    const spotifyUri = formatTrackIdForPlayer(recommendation);

    const response = {
      track: {
        // Internal id only — do NOT feed this to the Spotify player.
        id: recommendation.id,

        // The only field the player should use to load this track.
        // null means there is no confirmed real Spotify ID —
        // the frontend must use `youtube` instead.
        spotifyUri: spotifyUri,
        hasSpotifyId: !!spotifyUri,

        title: recommendation.title,
        artist: recommendation.artist,
        album: recommendation.album || "Unknown Album",
        genre: recommendation.genre || "pop",
        year: recommendation.year || "",
      },

      // Human-readable explanation of the recommendation.
      reason:
        source === "ReccoBeats"
          ? `Recommended by ReccoBeats based on your seed tracks`
          : `Based on your preferences and similar to your seed tracks`,

      // Score rounded to 3 decimal places for readability.
      score: parseFloat((recommendation._score || 0.85).toFixed(3)),

      // Optional YouTube fallback (may be null).
      youtube: youtube,

      // Always 1 for this single-recommendation endpoint.
      candidates_considered: 1,

      // ✅ Now returns objects, not strings.
      // This was a fix: the frontend previously crashed when this array
      // contained raw strings, because it tried to access `.title` on
      // a string.
      input_tracks: inputTracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
      })),

      // Which data source produced the recommendation.
      source: source,
    };

    res.json(response);
  } catch (error) {
    // Catch-all error handler for any uncaught exception in the route.
    console.error("❌ Recommendation error:", error);
    res.status(500).json({
      error: "Failed to generate recommendation",
      details: error.message,
    });
  }
});

// Export the router so it can be mounted in server.js.
module.exports = router;
