// src/routes/playlist.js

const express = require("express");
const router = express.Router();
const {
  getRecommendations,
  searchTrack,
  searchTracksByText,
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
 * Check if a string is a valid Spotify ID format
 */
function isValidSpotifyId(input) {
  if (!input) return false;
  if (input.startsWith("spotify:track:")) return true;
  if (input.includes("open.spotify.com/track/")) return true;
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) return true;
  return false;
}

/**
 * Generate a playlist using sample data with proper Spotify IDs
 */
function generateFromSampleData(
  seedIds,
  preferences = {},
  playlist_length = 10,
) {
  let candidates = [];
  const seedIdsSet = new Set(seedIds);

  for (const [id, track] of Object.entries(sampleTracks)) {
    // Skip if this track is in the seed list
    if (seedIdsSet.has(id)) continue;
    // Also check if the clean Spotify ID matches
    const cleanId = extractSpotifyId(id);
    if (seedIdsSet.has(cleanId)) continue;
    if (candidates.find((c) => c.id === id)) continue;

    candidates.push({ ...track, id });
  }

  const scored = candidates.map((candidate) => {
    let score = 0.5;

    // Mood-based scoring
    if (preferences.mood === "energetic" && candidate.energy > 0.7)
      score += 0.3;
    if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
    if (preferences.mood === "happy" && candidate.valence > 0.6) score += 0.3;
    if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;

    // Discovery factor
    if (preferences.discovery && preferences.discovery > 0.5) {
      score += (1 - (candidate.popularity || 0.5)) * 0.2;
    }

    // Genre bias
    if (preferences.genre && preferences.genre !== "any") {
      if (
        candidate.genre &&
        candidate.genre.toLowerCase() === preferences.genre.toLowerCase()
      ) {
        score += 0.2;
      }
    }

    return { ...candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top N unique tracks
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
 * Format a track ID for the Spotify player
 * Ensures the ID is in the format expected by the Spotify Embed
 */
function formatTrackIdForPlayer(track) {
  // Use spotifyId if available, otherwise use id
  let spotifyId = track.spotifyId || track.id;

  if (!spotifyId) return null;

  // If it's already a valid Spotify URI, return as-is
  if (spotifyId.startsWith("spotify:track:")) {
    return spotifyId;
  }

  // If it's a Spotify URL, extract the ID
  if (spotifyId.includes("open.spotify.com/track/")) {
    const match = spotifyId.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `spotify:track:${match[1]}`;
    }
  }

  // If it's a clean 22-character ID, format it
  if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyId)) {
    return `spotify:track:${spotifyId}`;
  }

  // If it's a sample data key that's not a valid Spotify ID, try to find the spotifyId property
  if (track.spotifyId) {
    return formatTrackIdForPlayer({ id: track.spotifyId });
  }

  // Last resort: return the original, but log a warning
  console.warn(`⚠️ Could not format track ID for player: ${spotifyId}`);
  return spotifyId;
}

/**
 * POST /api/playlist
 * Generate a full playlist using ReccoBeats (FREE) with sample data fallback
 */
router.post("/", async (req, res) => {
  try {
    const { seed_tracks, preferences = {}, playlist_length = 10 } = req.body;

    // Validate input
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

    // STEP 1: Process each seed - handle both IDs and text searches
    const resolvedSeeds = [];

    for (const seed of seed_tracks) {
      // Check if this is a valid Spotify ID format
      if (isValidSpotifyId(seed)) {
        // It's a Spotify ID - try to convert to ReccoBeats ID
        const cleanId = extractSpotifyId(seed);
        console.log(`🔍 Converting Spotify ID ${cleanId} to ReccoBeats ID...`);

        const rbTrack = await searchTrack(cleanId);
        if (rbTrack && rbTrack.reccobeatsId) {
          reccobeatsIds.push(rbTrack.reccobeatsId);
          resolvedSeeds.push({
            original: seed,
            cleanId: cleanId,
            reccobeatsId: rbTrack.reccobeatsId,
            title: rbTrack.title,
            artist: rbTrack.artist,
            spotifyId: rbTrack.spotifyId || cleanId,
          });
          console.log(`✅ Converted to ReccoBeats ID: ${rbTrack.reccobeatsId}`);
        } else {
          // Fallback: check if this ID exists in sample data
          const sampleMatch = sampleTracks[cleanId] || sampleTracks[seed];
          if (sampleMatch) {
            resolvedSeeds.push({
              original: seed,
              cleanId: cleanId,
              title: sampleMatch.title,
              artist: sampleMatch.artist,
              spotifyId: sampleMatch.spotifyId || cleanId,
              sampleData: sampleMatch,
            });
            console.log(
              `✅ Found in sample data: ${sampleMatch.title} - ${sampleMatch.artist}`,
            );
          } else {
            console.log(`⚠️ Could not resolve seed: ${seed}`);
          }
        }
      } else {
        // It's a text search query - try to search ReccoBeats
        console.log(
          `🔍 Text search detected: "${seed}" - searching ReccoBeats...`,
        );

        try {
          const searchResults = await searchTracksByText(seed, 3);
          if (searchResults && searchResults.length > 0) {
            const firstResult = searchResults[0];

            if (firstResult.id) {
              reccobeatsIds.push(firstResult.id);
              resolvedSeeds.push({
                original: seed,
                cleanId: firstResult.id,
                reccobeatsId: firstResult.id,
                title: firstResult.title,
                artist: firstResult.artist,
                spotifyId: firstResult.spotifyId || null,
              });
              console.log(
                `✅ Found via text search: ${firstResult.title} - ${firstResult.artist}`,
              );
            }
          } else {
            // No ReccoBeats results - try sample data
            console.log(
              `⚠️ No ReccoBeats results for "${seed}", checking sample data...`,
            );
            let found = false;
            for (const [id, track] of Object.entries(sampleTracks)) {
              if (
                track.title.toLowerCase().includes(seed.toLowerCase()) ||
                track.artist.toLowerCase().includes(seed.toLowerCase())
              ) {
                resolvedSeeds.push({
                  original: seed,
                  cleanId: id,
                  title: track.title,
                  artist: track.artist,
                  spotifyId: track.spotifyId || id,
                  sampleData: track,
                });
                found = true;
                console.log(
                  `✅ Found in sample data: ${track.title} - ${track.artist}`,
                );
                break;
              }
            }
            if (!found) {
              console.log(`⚠️ Could not resolve text search: "${seed}"`);
            }
          }
        } catch (error) {
          console.error(`❌ Text search failed for "${seed}":`, error.message);
        }
      }
    }

    console.log(`📊 Resolved seeds: ${resolvedSeeds.length} tracks`);

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

      // Use resolved seeds or original seed_tracks for the fallback
      const seedIdsForFallback = resolvedSeeds
        .map((s) => s.cleanId || s.original)
        .filter(Boolean);
      const fallbackSeeds =
        seedIdsForFallback.length > 0 ? seedIdsForFallback : seed_tracks;

      const sampleTracksResult = generateFromSampleData(
        fallbackSeeds,
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
          spotifyId: track.spotifyId || track.id,
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

    // STEP 4: Build final playlist with properly formatted Spotify IDs
    const playlist = [];
    for (const track of playlistData) {
      // Format the ID properly for the Spotify player
      const formattedTrackId = formatTrackIdForPlayer(track);

      let youtube = null;
      const searchQuery = `${track.title} ${track.artist} official audio`;

      try {
        const results = await searchYouTube(searchQuery, 1);
        if (results && results.length > 0) {
          youtube = results[0];
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

      playlist.push({
        track: {
          id: formattedTrackId || track.id,
          title: track.title,
          artist: track.artist,
          album: album,
          genre: genre,
          year: year,
          popularity: track.popularity || 0,
          hasSpotifyId:
            !!formattedTrackId && formattedTrackId.startsWith("spotify:track:"),
        },
        score: track._score || 0.8,
        reason:
          track._source === "Sample Data"
            ? `Based on your preferences${preferences.mood ? ` (${preferences.mood})` : ""}`
            : `Recommended by ReccoBeats based on your seed tracks`,
        youtube: youtube,
        source: track._source || source,
      });
    }

    res.json({
      playlist: playlist,
      total: playlist.length,
      seed_tracks: seed_tracks,
      resolved_seeds: resolvedSeeds.map((s) => `${s.title} - ${s.artist}`),
      preferences: preferences,
      source: source,
      message: playlist.some((t) => !t.track.hasSpotifyId)
        ? "Some tracks may not have Spotify playback available - YouTube links provided"
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
