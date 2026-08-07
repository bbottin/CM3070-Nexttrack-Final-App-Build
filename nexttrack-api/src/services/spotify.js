// src/services/spotify.js

const axios = require("axios");
const querystring = require("querystring");

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

let accessToken = null;
let tokenExpiry = null;

/**
 * Get Spotify access token (Client Credentials Flow)
 */
async function getAccessToken() {
  // Check if we have a valid token
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log("✅ Using cached Spotify token");
    return accessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.error("❌ Spotify credentials missing!");
    console.error(
      `   SPOTIFY_CLIENT_ID: ${SPOTIFY_CLIENT_ID ? "✅ Set" : "❌ Missing"}`,
    );
    console.error(
      `   SPOTIFY_CLIENT_SECRET: ${SPOTIFY_CLIENT_SECRET ? "✅ Set" : "❌ Missing"}`,
    );
    return null;
  }

  try {
    console.log("🔄 Getting new Spotify token...");
    console.log(`   Client ID: ${SPOTIFY_CLIENT_ID.substring(0, 8)}...`);

    const authString = Buffer.from(
      `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "client_credentials",
      }),
      {
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      },
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000 - 60000;
    console.log("✅ Spotify token acquired successfully!");
    return accessToken;
  } catch (error) {
    console.error("❌ Failed to get Spotify token:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    } else {
      console.error(`   Message: ${error.message}`);
    }
    return null;
  }
}

/**
 * Search for tracks on Spotify
 */
async function searchTracks(query, limit = 10) {
  try {
    const token = await getAccessToken();
    if (!token) {
      console.warn("⚠️ No Spotify token - search will fail");
      return [];
    }

    console.log(`🔍 Searching Spotify API: "${query}"`);

    const response = await axios.get("https://api.spotify.com/v1/search", {
      params: {
        q: query,
        type: "track",
        limit: Math.min(limit, 50),
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    });

    console.log(`📊 Spotify API response status: ${response.status}`);

    if (response.data && response.data.tracks && response.data.tracks.items) {
      const items = response.data.tracks.items;
      console.log(`✅ Found ${items.length} tracks from Spotify`);

      return items.map((item) => ({
        id: item.id,
        title: item.name,
        artist: item.artists[0]?.name || "Unknown",
        album: item.album?.name || "Unknown",
        year: item.album?.release_date?.split("-")[0] || "",
        image: item.album?.images?.[0]?.url || null,
        preview_url: item.preview_url || null,
        external_url: item.external_urls?.spotify || null,
        popularity: item.popularity || 0,
      }));
    }

    console.log("⚠️ No tracks found in Spotify response");
    return [];
  } catch (error) {
    console.error("❌ Spotify search failed:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    } else {
      console.error(`   Message: ${error.message}`);
    }
    return [];
  }
}

/**
 * Get audio features for a track
 */
async function getAudioFeatures(trackId) {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await axios.get(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      },
    );

    const data = response.data;
    return {
      energy: data.energy || 0.5,
      valence: data.valence || 0.5,
      tempo: data.tempo || 120,
      danceability: data.danceability || 0.5,
      acousticness: data.acousticness || 0.5,
      instrumentalness: data.instrumentalness || 0,
      loudness: data.loudness || 0,
      speechiness: data.speechiness || 0,
    };
  } catch (error) {
    console.error(
      `❌ Failed to get audio features for ${trackId}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Get track details with audio features
 */
async function getTrack(trackId) {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const trackResponse = await axios.get(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      },
    );

    const item = trackResponse.data;
    const features = await getAudioFeatures(trackId);

    return {
      id: item.id,
      title: item.name,
      artist: item.artists[0]?.name || "Unknown",
      album: item.album?.name || "Unknown",
      year: item.album?.release_date?.split("-")[0] || "",
      image: item.album?.images?.[0]?.url || null,
      preview_url: item.preview_url || null,
      external_url: item.external_urls?.spotify || null,
      popularity: item.popularity || 0,
      features: features || {
        energy: 0.5,
        valence: 0.5,
        tempo: 120,
        danceability: 0.5,
        acousticness: 0.5,
      },
    };
  } catch (error) {
    console.error(`❌ Failed to get track ${trackId}:`, error.message);
    return null;
  }
}

module.exports = {
  searchTracks,
  getAudioFeatures,
  getTrack,
  getAccessToken,
};
