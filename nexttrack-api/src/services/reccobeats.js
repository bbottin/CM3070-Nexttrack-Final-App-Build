// src/services/reccobeats.js

const axios = require("axios");

const BASE_URL = "https://api.reccobeats.com";

/**
 * Extract clean Spotify ID from various formats
 */
function extractSpotifyId(input) {
  if (!input) return null;

  if (input.startsWith("spotify:track:")) {
    return input.split(":")[2];
  }

  if (input.includes("open.spotify.com/track/")) {
    const match = input.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) {
    return input;
  }

  return input;
}

/**
 * Fetch track features from ReccoBeats (for track.js)
 * This replaces the removed fetchTrackFeatures
 */
async function getTrackById(trackId) {
  try {
    console.log(`🔍 Fetching track from ReccoBeats: ${trackId}`);

    // First, search for the track
    const cleanId = extractSpotifyId(trackId);
    const searchResult = await searchTrack(cleanId || trackId);

    if (searchResult) {
      return {
        id: searchResult.reccobeatsId,
        title: searchResult.title,
        artist: searchResult.artist,
        album: "Unknown Album",
        genre: "pop",
        year: 2020,
        energy: 0.5,
        valence: 0.5,
        tempo: 120,
        danceability: 0.5,
        acousticness: 0.5,
        popularity: 0.5,
        reccobeatsId: searchResult.reccobeatsId,
      };
    }

    // If not found in ReccoBeats, check sample data
    const sampleTracks = require("../data/sampleTracks.json");
    if (sampleTracks[trackId] || sampleTracks[cleanId]) {
      const track = sampleTracks[trackId] || sampleTracks[cleanId];
      return { ...track, id: trackId || cleanId };
    }

    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch track ${trackId}:`, error.message);
    return null;
  }
}

/**
 * Search for a track in ReccoBeats by Spotify ID
 */
async function searchTrack(spotifyId) {
  try {
    console.log(`🔍 Searching ReccoBeats for Spotify ID: ${spotifyId}`);

    const response = await axios.get(`${BASE_URL}/v1/track/search`, {
      params: {
        searchText: spotifyId,
        limit: 1,
      },
      timeout: 10000,
      headers: {
        Accept: "application/json",
      },
    });

    if (
      response.data &&
      response.data.content &&
      response.data.content.length > 0
    ) {
      const track = response.data.content[0];
      console.log(`✅ Found ReccoBeats ID: ${track.id}`);
      return {
        reccobeatsId: track.id,
        title: track.trackTitle,
        artist: track.artists?.[0]?.name || "Unknown Artist",
        spotifyId: spotifyId,
      };
    }

    return null;
  } catch (error) {
    console.warn(
      `⚠️ ReccoBeats search failed:`,
      error.response?.data || error.message,
    );
    return null;
  }
}

/**
 * Get track recommendations from ReccoBeats
 */
async function getRecommendations(reccobeatsIds, size = 10, filters = {}) {
  try {
    if (!reccobeatsIds || reccobeatsIds.length === 0) {
      console.error("❌ No ReccoBeats IDs provided");
      return [];
    }

    console.log(
      `🎵 Getting recommendations from ReccoBeats for IDs: ${reccobeatsIds.join(", ")}`,
    );

    const params = {
      seeds: reccobeatsIds.join(","),
      size: Math.min(size, 100),
      ...filters,
    };

    const response = await axios.get(`${BASE_URL}/v1/track/recommendation`, {
      params: params,
      timeout: 10000,
      headers: {
        Accept: "application/json",
      },
    });

    if (response.data && response.data.content) {
      console.log(
        `✅ ReccoBeats returned ${response.data.content.length} recommendations`,
      );
      return response.data.content.map((item) => ({
        id: item.id,
        title: item.trackTitle,
        artist: item.artists?.[0]?.name || "Unknown Artist",
        popularity: item.popularity || 0,
        isrc: item.isrc,
        href: item.href,
      }));
    }
    return [];
  } catch (error) {
    console.error(
      "❌ ReccoBeats recommendation failed:",
      error.response?.data || error.message,
    );
    return [];
  }
}

/**
 * Search for tracks by text query (e.g., "Steve Aoki")
 */
async function searchTracksByText(query, limit = 10) {
  try {
    console.log(`🔍 Searching ReccoBeats for: "${query}"`);

    const response = await axios.get(`${BASE_URL}/v1/track/search`, {
      params: {
        searchText: query,
        limit: limit,
      },
      timeout: 10000,
      headers: {
        Accept: "application/json",
      },
    });

    if (
      response.data &&
      response.data.content &&
      response.data.content.length > 0
    ) {
      console.log(
        `✅ Found ${response.data.content.length} tracks from ReccoBeats`,
      );
      return response.data.content.map((track) => ({
        id: track.id,
        title: track.trackTitle,
        artist: track.artists?.[0]?.name || "Unknown Artist",
        album: track.album || "Unknown Album",
        year: track.year || "",
        popularity: track.popularity || 0,
        source: "ReccoBeats",
      }));
    }
    return [];
  } catch (error) {
    console.warn(
      `⚠️ ReccoBeats text search failed:`,
      error.response?.data || error.message,
    );
    return [];
  }
}

module.exports = {
  getRecommendations,
  searchTrack,
  searchTracksByText,
  getTrackById,
  extractSpotifyId,
};
