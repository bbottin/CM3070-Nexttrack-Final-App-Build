// src/services/reccobeats.js

const axios = require("axios");
const { getTrack, searchTracks: searchSpotify } = require("./spotify");

const BASE_URL = process.env.RECCOBEATS_API_URL || "https://api.reccobeats.com";
const USE_RECCOBEATS = process.env.USE_RECCOBEATS === "true"; // Enable if you have paid API key

/**
 * Fetch audio features for a track
 * Tries ReccoBeats first (if enabled), then falls back to Spotify
 */
async function fetchTrackFeatures(trackId) {
  // Try ReccoBeats first (if you have a paid key)
  if (USE_RECCOBEATS) {
    try {
      const response = await axios.get(
        `${BASE_URL}/track/${trackId}/features`,
        {
          timeout: 5000,
          headers: { Accept: "application/json" },
        },
      );

      const data = response.data;
      if (data && !data.error) {
        return {
          id: trackId,
          title: data.title || "Unknown Title",
          artist: data.artist || "Unknown Artist",
          album: data.album || "Unknown Album",
          genre: data.genre || "pop",
          year: data.year || 2020,
          energy: data.energy || 0.5,
          valence: data.valence || 0.5,
          tempo: data.tempo || 120,
          danceability: data.danceability || 0.5,
          acousticness: data.acousticness || 0.5,
          popularity: data.popularity || 0.5,
        };
      }
    } catch (error) {
      console.warn(`ReccoBeats failed for ${trackId}:`, error.message);
      // Fall through to Spotify
    }
  }

  // Fallback to Spotify
  try {
    const track = await getTrack(trackId);
    if (track && track.features) {
      return {
        id: trackId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: "pop", // Spotify doesn't have genre per track
        year: parseInt(track.year) || 2020,
        energy: track.features.energy || 0.5,
        valence: track.features.valence || 0.5,
        tempo: track.features.tempo || 120,
        danceability: track.features.danceability || 0.5,
        acousticness: track.features.acousticness || 0.5,
        popularity: track.popularity || 0.5,
      };
    }
    return null;
  } catch (error) {
    console.warn(`Spotify fallback failed for ${trackId}:`, error.message);
    return null;
  }
}

/**
 * Search for tracks (uses Spotify)
 * This is the ONLY declaration of searchTracks
 */
async function searchTracks(query, limit = 10) {
  try {
    const results = await searchSpotify(query, limit);
    return results || [];
  } catch (error) {
    console.warn(`Search failed:`, error.message);
    return [];
  }
}

module.exports = { fetchTrackFeatures, searchTracks };
