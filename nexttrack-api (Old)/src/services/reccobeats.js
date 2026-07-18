// src/services/reccobeats.js

const axios = require("axios");
const BASE_URL = process.env.RECCOBEATS_API_URL || "https://api.reccobeats.com";

/**
 * Fetch audio features for a track from ReccoBeats
 * @param {string} trackId - Track ID (Spotify format)
 * @returns {Object|null} Track features or null if not found
 */
async function fetchTrackFeatures(trackId) {
  try {
    // Note: ReccoBeats endpoints may vary - this follows their documentation pattern
    const response = await axios.get(`${BASE_URL}/track/${trackId}/features`, {
      timeout: 5000,
      headers: {
        Accept: "application/json",
      },
    });

    const data = response.data;

    if (data && !data.error) {
      return {
        id: trackId,
        title: data.title || data.name || "Unknown Title",
        artist: data.artist || data.artists?.[0] || "Unknown Artist",
        album: data.album || "Unknown Album",
        genre: data.genre || data.genres?.[0] || "pop",
        year: data.year || data.release_year || 2020,
        energy: data.energy || data.energy_score || 0.5,
        valence: data.valence || data.valence_score || 0.5,
        tempo: data.tempo || data.bpm || 120,
        danceability: data.danceability || data.danceability_score || 0.5,
        acousticness: data.acousticness || data.acousticness_score || 0.5,
        popularity: data.popularity || 0.5,
      };
    }
    return null;
  } catch (error) {
    console.warn(`ReccoBeats fetch failed for ${trackId}: ${error.message}`);
    return null;
  }
}

/**
 * Search for tracks by query (optional, for future use)
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Array} Search results
 */
async function searchTracks(query, limit = 10) {
  try {
    const response = await axios.get(`${BASE_URL}/search`, {
      params: { q: query, limit },
      timeout: 5000,
    });
    return response.data.results || [];
  } catch (error) {
    console.warn(`Search failed: ${error.message}`);
    return [];
  }
}

module.exports = { fetchTrackFeatures, searchTracks };
