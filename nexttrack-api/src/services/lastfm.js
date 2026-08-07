// src/services/lastfm.js

const axios = require("axios");

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || "";
const LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/";

/**
 * Search for tracks on Last.fm
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Array} Track results
 */
async function searchTracks(query, limit = 10) {
  try {
    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.search",
        track: query,
        api_key: LASTFM_API_KEY,
        format: "json",
        limit: limit,
      },
      timeout: 5000,
    });

    if (
      response.data &&
      response.data.results &&
      response.data.results.trackmatches
    ) {
      return response.data.results.trackmatches.track.map((item) => ({
        id: item.mbid || `lastfm:${item.name}|${item.artist}`,
        title: item.name,
        artist: item.artist,
        album: "Unknown",
        year: "",
        image: item.image?.[3]?.["#text"] || null,
        listeners: item.listeners || 0,
        source: "Last.fm",
      }));
    }
    return [];
  } catch (error) {
    console.error("Last.fm search failed:", error.message);
    return [];
  }
}

/**
 * Get track info from Last.fm
 * @param {string} artist - Artist name
 * @param {string} track - Track name
 * @returns {Object} Track info
 */
async function getTrackInfo(artist, track) {
  try {
    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.getInfo",
        artist: artist,
        track: track,
        api_key: LASTFM_API_KEY,
        format: "json",
      },
      timeout: 5000,
    });

    if (response.data && response.data.track) {
      const data = response.data.track;
      return {
        id: data.mbid || `lastfm:${data.name}|${data.artist.name}`,
        title: data.name,
        artist: data.artist.name,
        album: data.album?.title || "Unknown",
        year: data.album?.release_date || "",
        image: data.album?.image?.[3]?.["#text"] || null,
        listeners: data.listeners || 0,
        playcount: data.playcount || 0,
        tags: data.toptags?.tag?.map((t) => t.name) || [],
      };
    }
    return null;
  } catch (error) {
    console.error("Last.fm track info failed:", error.message);
    return null;
  }
}

module.exports = { searchTracks, getTrackInfo };
