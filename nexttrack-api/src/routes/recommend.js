// src/routes/recommend.js

const express = require("express");
const router = express.Router();
const {
  getRecommendations,
  searchTrack,
  extractSpotifyId,
} = require("../services/reccobeats");
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * Resolve a playable spotify:track:... URI for a recommendation, or null if
 * we don't have a confirmed real Spotify ID for it. This endpoint used to
 * send ReccoBeats' internal UUID (or a sample-data key) straight through as
 * `track.id` with no validation at all, which is how the "now playing"
 * track could end up completely unrelated to the recommendation being shown.
 */
function formatTrackIdForPlayer(track) {
  const spotifyId = track.spotifyId;
  if (!spotifyId) return null;
  if (spotifyId.startsWith("spotify:track:")) return spotifyId;
  if (spotifyId.includes("open.spotify.com/track/")) {
    const match = spotifyId.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return `spotify:track:${match[1]}`;
  }
  if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyId)) {
    return `spotify:track:${spotifyId}`;
  }
  return null;
}

/**
 * POST /api/recommend
 * Get a next track recommendation
 */
router.post("/", async (req, res) => {
  try {
    const { track_ids, preferences = {} } = req.body;

    if (!track_ids || !Array.isArray(track_ids) || track_ids.length < 1) {
      return res.status(400).json({
        error: 'Please provide at least 1 track ID in the "track_ids" array',
      });
    }

    console.log(`📥 Incoming track_ids:`, track_ids);

    // STEP 1: Convert Spotify IDs → ReccoBeats IDs
    let reccobeatsIds = [];
    const inputTracks = [];

    for (const id of track_ids) {
      const cleanId = extractSpotifyId(id);

      // Try to find in sample data first (for title/artist info)
      let trackInfo = null;
      if (sampleTracks[cleanId] || sampleTracks[id]) {
        const track = sampleTracks[cleanId] || sampleTracks[id];
        trackInfo = {
          id: cleanId || id,
          title: track.title,
          artist: track.artist,
        };
      }

      // Try to convert to ReccoBeats ID
      const rbTrack = await searchTrack(cleanId || id);
      if (rbTrack && rbTrack.reccobeatsId) {
        reccobeatsIds.push(rbTrack.reccobeatsId);
        if (!trackInfo) {
          trackInfo = {
            id: cleanId || id,
            title: rbTrack.title || cleanId || id,
            artist: rbTrack.artist || "Unknown",
          };
        }
      }

      if (trackInfo) {
        inputTracks.push(trackInfo);
      } else {
        // Fallback: use the ID as title
        inputTracks.push({
          id: cleanId || id,
          title: cleanId || id,
          artist: "Unknown",
        });
      }
    }

    let recommendation = null;
    let source = "Unknown";

    // STEP 2: Get recommendation using ReccoBeats IDs
    if (reccobeatsIds.length > 0) {
      try {
        const recommendations = await getRecommendations(reccobeatsIds, 1, {
          energy: preferences.energy,
          valence: preferences.valence,
          popularity: preferences.popularity,
        });

        if (recommendations && recommendations.length > 0) {
          // recommendations[0].spotifyId is the real Spotify ID (extracted from
          // ReccoBeats' href) - recommendations[0].id is ReccoBeats' own UUID,
          // which is NOT playable in the Spotify embed.
          recommendation = recommendations[0];
          source = "ReccoBeats";
          console.log(
            `✅ Recommendation from ReccoBeats: ${recommendation.title}`,
          );
        }
      } catch (error) {
        console.error("❌ ReccoBeats recommendation failed:", error.message);
      }
    }

    // STEP 3: Fallback to sample data if ReccoBeats failed
    if (!recommendation) {
      console.log("🔄 Falling back to sample data for recommendation");

      // Get all sample tracks except input ones
      const candidates = [];
      const inputIds = new Set(
        track_ids.map((id) => extractSpotifyId(id) || id),
      );

      for (const [id, track] of Object.entries(sampleTracks)) {
        if (!inputIds.has(id) && !inputIds.has(extractSpotifyId(id))) {
          candidates.push({ ...track, id });
        }
      }

      // Score candidates based on preferences
      const scored = candidates.map((candidate) => {
        let score = 0.5;
        if (preferences.mood === "energetic" && candidate.energy > 0.7)
          score += 0.3;
        if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
        if (preferences.mood === "happy" && candidate.valence > 0.6)
          score += 0.3;
        if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;
        return { ...candidate, score };
      });

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

    // STEP 4: Get YouTube link
    let youtube = null;
    const searchQuery = `${recommendation.title} ${recommendation.artist} official audio`;
    const results = await searchYouTube(searchQuery, 1);
    if (results && results.length > 0 && results[0].videoId) {
      youtube = {
        videoId: results[0].videoId,
        embedUrl: getYouTubeEmbedUrl(results[0].videoId),
        thumbnail: results[0].thumbnail,
        title: results[0].title,
      };
    } else if (results && results.length > 0 && results[0].searchUrl) {
      youtube = {
        searchUrl: results[0].searchUrl,
        note: results[0].note,
      };
    }

    // STEP 5: Build response with proper input_tracks objects
    const spotifyUri = formatTrackIdForPlayer(recommendation);
    const response = {
      track: {
        // Internal id only - do not feed this to the Spotify player.
        id: recommendation.id,
        // The only field the player should use to load this track.
        // null means we don't have a confirmed real Spotify ID - use `youtube` instead.
        spotifyUri: spotifyUri,
        hasSpotifyId: !!spotifyUri,
        title: recommendation.title,
        artist: recommendation.artist,
        album: recommendation.album || "Unknown Album",
        genre: recommendation.genre || "pop",
        year: recommendation.year || "",
      },
      reason:
        source === "ReccoBeats"
          ? `Recommended by ReccoBeats based on your seed tracks`
          : `Based on your preferences and similar to your seed tracks`,
      score: parseFloat((recommendation._score || 0.85).toFixed(3)),
      youtube: youtube,
      candidates_considered: 1,
      input_tracks: inputTracks.map((t) => ({
        // ✅ Now returns objects, not strings
        id: t.id,
        title: t.title,
        artist: t.artist,
      })),
      source: source,
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Recommendation error:", error);
    res.status(500).json({
      error: "Failed to generate recommendation",
      details: error.message,
    });
  }
});

module.exports = router;
