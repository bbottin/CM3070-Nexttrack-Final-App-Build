// src/routes/playlist.js

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
 * Helper function to find a track in sample data by title and artist
 */
function findTrackInSampleData(title, artist) {
  if (!title && !artist) return null;

  const titleLower = title?.toLowerCase() || "";
  const artistLower = artist?.toLowerCase() || "";

  for (const [id, track] of Object.entries(sampleTracks)) {
    const trackTitleLower = track.title?.toLowerCase() || "";
    const trackArtistLower = track.artist?.toLowerCase() || "";

    const titleMatch = titleLower && trackTitleLower.includes(titleLower);
    const artistMatch = artistLower && trackArtistLower.includes(artistLower);

    if (titleLower && artistLower) {
      if (titleMatch && artistMatch) {
        return { ...track, id };
      }
    } else if (titleLower && !artistLower) {
      if (titleMatch) {
        return { ...track, id };
      }
    } else if (!titleLower && artistLower) {
      if (artistMatch) {
        return { ...track, id };
      }
    }
  }
  return null;
}

/**
 * Generate a playlist using sample data with proper scoring
 */
function generateFromSampleData(
  seedIds,
  preferences = {},
  playlist_length = 10,
) {
  let candidates = [];
  const seedIdsSet = new Set(seedIds);

  for (const [id, track] of Object.entries(sampleTracks)) {
    if (
      !seedIdsSet.has(id) &&
      !seedIdsSet.has(extractSpotifyId(id)) &&
      !candidates.find((c) => c.id === id)
    ) {
      candidates.push({ ...track, id });
    }
  }

  const scored = candidates.map((candidate) => {
    let score = 0.5;

    // Mood-based scoring (use preferences)
    if (preferences.mood === "energetic" && candidate.energy > 0.7)
      score += 0.3;
    if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
    if (preferences.mood === "happy" && candidate.valence > 0.6) score += 0.3;
    if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;

    // Discovery factor
    if (preferences.discovery && preferences.discovery > 0.5) {
      score += (1 - candidate.popularity) * 0.2;
    }

    // Genre bias
    if (
      preferences.genre_bias &&
      candidate.genre &&
      candidate.genre.toLowerCase() === preferences.genre_bias.toLowerCase()
    ) {
      score += 0.2;
    }

    return { ...candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);

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

  return uniqueTracks;
}

/**
 * POST /api/playlist
 * Generate a full playlist using ReccoBeats (FREE) with sample data fallback
 */
router.post("/", async (req, res) => {
  try {
    const { seed_tracks, preferences = {}, playlist_length = 10 } = req.body;

    if (!seed_tracks || !Array.isArray(seed_tracks) || seed_tracks.length < 1) {
      return res.status(400).json({
        error:
          'Please provide at least 1 seed track in the "seed_tracks" array',
      });
    }

    console.log(`📥 Incoming seed_tracks:`, seed_tracks);

    let playlistData = [];
    let source = "Unknown";
    let reccobeatsIds = [];

    // STEP 1: Convert Spotify IDs → ReccoBeats IDs
    for (const seed of seed_tracks) {
      const cleanId = extractSpotifyId(seed);
      if (cleanId) {
        console.log(`🔍 Converting Spotify ID ${cleanId} to ReccoBeats ID...`);
        const rbTrack = await searchTrack(cleanId);
        if (rbTrack && rbTrack.reccobeatsId) {
          reccobeatsIds.push(rbTrack.reccobeatsId);
          console.log(`✅ Converted to ReccoBeats ID: ${rbTrack.reccobeatsId}`);
        } else {
          console.log(
            `⚠️ Could not convert Spotify ID ${cleanId} to ReccoBeats ID`,
          );
        }
      }
    }

    // STEP 2: Get recommendations using ReccoBeats IDs
    if (reccobeatsIds.length > 0) {
      try {
        const recommendations = await getRecommendations(
          reccobeatsIds,
          playlist_length,
          {
            energy: preferences.energy,
            valence: preferences.valence,
            popularity: preferences.popularity,
          },
        );

        if (recommendations && recommendations.length > 0) {
          console.log(
            `✅ ReccoBeats returned ${recommendations.length} recommendations`,
          );
          playlistData = recommendations.map((track) => ({
            ...track,
            _source: "ReccoBeats",
            _score: 0.85,
          }));
          source = "ReccoBeats (free)";
        }
      } catch (error) {
        console.error(
          "❌ ReccoBeats playlist generation failed:",
          error.message,
        );
      }
    }

    // STEP 3: Fallback to sample data if ReccoBeats didn't work
    if (!playlistData || playlistData.length === 0) {
      console.log("🔄 Falling back to sample data for playlist generation");
      const sampleTracksResult = generateFromSampleData(
        seed_tracks,
        preferences,
        playlist_length,
      );

      if (sampleTracksResult && sampleTracksResult.length > 0) {
        playlistData = sampleTracksResult.map((track) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album || "Unknown Album",
          genre: track.genre || "pop",
          year: track.year || "",
          popularity: track.popularity || 0,
          _score: track.score || 0.5,
          _source: "Sample Data",
        }));
        source = "Sample Data (fallback)";
        console.log(
          `✅ Generated ${playlistData.length} tracks from sample data`,
        );
      }
    }

    if (!playlistData || playlistData.length === 0) {
      return res.status(404).json({
        error: "No recommendations found. Try different seed tracks.",
        suggestion:
          "Make sure your seed tracks are valid Spotify IDs or try adding more tracks.",
      });
    }

    // STEP 4: Build final playlist
    const playlist = [];
    for (const track of playlistData) {
      let youtube = null;
      const searchQuery = `${track.title} ${track.artist} official audio`;

      try {
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
      } catch (youtubeError) {
        console.warn(`⚠️ YouTube search failed for "${searchQuery}"`);
      }

      let album = track.album || "Unknown Album";
      let year = track.year || "";
      let genre = track.genre || "pop";

      const sampleMatch = findTrackInSampleData(track.title, track.artist);
      if (sampleMatch) {
        album = sampleMatch.album || album;
        year = sampleMatch.year || year;
        genre = sampleMatch.genre || genre;
      }

      // Build reason based on source and preferences
      let reason =
        track._source === "Sample Data"
          ? `Based on your preferences${preferences.mood ? ` (${preferences.mood})` : ""}`
          : `Recommended by ReccoBeats based on your seed tracks`;

      playlist.push({
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: album,
          genre: genre,
          year: year,
          popularity: track.popularity || 0,
        },
        score: track._score || 0.8,
        reason: reason,
        youtube: youtube,
        source: track._source || source,
      });
    }

    res.json({
      playlist: playlist,
      total: playlist.length,
      seed_tracks: seed_tracks,
      preferences: preferences,
      source: source,
      reccobeats_ids_used: reccobeatsIds,
      message: playlist.some((t) => !t.youtube || !t.youtube.videoId)
        ? "Some tracks may not have YouTube videos available"
        : null,
    });
  } catch (error) {
    console.error("❌ Playlist generation error:", error);
    res.status(500).json({
      error: "Failed to generate playlist",
      details: error.message,
    });
  }
});

module.exports = router;
