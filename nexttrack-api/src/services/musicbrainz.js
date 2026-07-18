// src/services/musicbrainz.js

const axios = require("axios");
const BASE_URL = "https://musicbrainz.org/ws/2";

/**
 * Fetch track metadata from MusicBrainz
 * @param {string} trackId - MusicBrainz track ID
 * @returns {Object|null} Track metadata or null if not found
 */
async function fetchTrackMetadata(trackId) {
  try {
    const response = await axios.get(`${BASE_URL}/track/${trackId}`, {
      params: {
        fmt: "json",
        inc: "artist-credits+releases",
      },
      timeout: 5000,
      headers: {
        "User-Agent":
          "NextTrackAPI/1.0 (https://github.com/yourusername/nexttrack)",
      },
    });

    const data = response.data;
    if (data && data.id) {
      return {
        id: data.id,
        title: data.title,
        artist: data["artist-credit"]?.[0]?.name || "Unknown",
        album: data.releases?.[0]?.title || "Unknown Album",
        genre: "pop", // MusicBrainz doesn't have direct genre
        year: data.releases?.[0]?.date?.split("-")[0] || "2020",
      };
    }
    return null;
  } catch (error) {
    console.warn(`MusicBrainz fetch failed for ${trackId}: ${error.message}`);
    return null;
  }
}

module.exports = { fetchTrackMetadata };
