// src/services/spotify.js

const axios = require("axios");

// Note: For production, use Spotify Web API with OAuth
// This is a fallback using MusicBrainz + guesswork

/**
 * Try to find a Spotify ID for a track
 * @param {string} title - Track title
 * @param {string} artist - Artist name
 * @returns {string|null} Spotify track ID or null
 */
async function findSpotifyId(title, artist) {
  try {
    // Try MusicBrainz first to get the ISRC
    const mbResponse = await axios.get(
      "https://musicbrainz.org/ws/2/recording",
      {
        params: {
          query: `"${title}" AND artist:"${artist}"`,
          fmt: "json",
          limit: 1,
        },
        headers: {
          "User-Agent":
            "NextTrackAPI/1.0 (https://github.com/yourusername/nexttrack)",
        },
        timeout: 5000,
      },
    );

    if (
      mbResponse.data &&
      mbResponse.data.recordings &&
      mbResponse.data.recordings.length > 0
    ) {
      const recording = mbResponse.data.recordings[0];

      // Look for ISRC (International Standard Recording Code)
      const isrc = recording.isrcs?.[0] || null;

      if (isrc) {
        // ISRC can be used to find Spotify IDs
        // Note: This is a simplified approach
        return isrc;
      }
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
 * Check if an ID is a Spotify ID
 * @param {string} id - Track ID
 * @returns {boolean} True if it looks like a Spotify ID
 */
function isSpotifyId(id) {
  return (
    id &&
    (id.startsWith("spotify:track:") ||
      id.startsWith("https://open.spotify.com/track/") ||
      (id.length === 22 && /^[a-zA-Z0-9_-]{22}$/.test(id))) // Spotify track IDs are 22 chars
  );
}

/**
 * Extract Spotify ID from various formats
 * @param {string} input - Spotify URI or URL or ID
 * @returns {string} Clean Spotify track ID
 */
function extractSpotifyId(input) {
  if (!input) return null;

  // If it's already a clean ID
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) {
    return input;
  }

  // If it's a Spotify URI: spotify:track:XXXXX
  if (input.startsWith("spotify:track:")) {
    return input.split(":")[2];
  }

  // If it's a Spotify URL: https://open.spotify.com/track/XXXXX
  if (input.includes("open.spotify.com/track/")) {
    const match = input.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  return input;
}

module.exports = { findSpotifyId, isSpotifyId, extractSpotifyId };
