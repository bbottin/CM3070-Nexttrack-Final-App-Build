// src/services/lastfm.js

// Import axios for making HTTP requests to the Last.fm API.
const axios = require("axios");

// Read the Last.fm API key from environment variables.
// Falls back to an empty string when not set, which is then
// detected as "missing" by the guards below.
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || "";

// Last.fm's public API base URL. All requests go through this
// single endpoint, differentiated by the `method` parameter.
const LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/";

/**
 * searchTracks
 * ------------------------------------------------------------
 * Search Last.fm's track catalogue for a free-text query.
 * Last.fm does not require a Premium subscription, which makes it
 * a useful free complement to ReccoBeats for search coverage.
 *
 * @param {string} query - Search query (e.g., "Bohemian Rhapsody Queen")
 * @param {number} limit - Maximum number of results to return
 * @returns {Array}  Array of normalised track objects; empty on failure
 */
async function searchTracks(query, limit = 10) {
  // Guard: if the API key is missing or still set to the placeholder
  // from .env.example, Last.fm will reject every request. Bail out
  // early with a helpful warning instead of throwing.
  if (!LASTFM_API_KEY || LASTFM_API_KEY === "your_lastfm_api_key_here") {
    console.warn(
      "⚠️ Last.fm API key missing or using placeholder. Get one from https://www.last.fm/api",
    );
    return [];
  }

  try {
    console.log(`🔍 Searching Last.fm: "${query}"`);

    // Call Last.fm's track.search method.
    // Last.fm wraps everything through a single endpoint and uses
    // `method` to select the operation, similar to a JSON-RPC style.
    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.search",
        track: query, // the search term
        api_key: LASTFM_API_KEY,
        format: "json", // request JSON rather than XML
        // Cap at 30 — Last.fm enforces an upper limit internally
        // and Math.min keeps our caller's request within that bound.
        limit: Math.min(limit, 30),
      },
      timeout: 10000, // 10s timeout so it does not hang indefinitely
    });

    // Defensive: Last.fm's response shape can vary, so check each
    // level of nesting before accessing the array of tracks.
    if (
      response.data &&
      response.data.results &&
      response.data.results.trackmatches
    ) {
      const tracks = response.data.results.trackmatches.track;
      console.log(`✅ Found ${tracks.length} tracks from Last.fm`);

      // Normalise each result into our app's common track shape so
      // downstream code doesn't have to know about Last.fm's quirks.
      return tracks.map((item) => ({
        // Prefer the MusicBrainz ID when Last.fm provides one
        // (usually for well-known tracks). Otherwise, synthesise a
        // stable pseudo-ID from the title + artist. The "lastfm:"
        // prefix makes it obvious that this is a Last.fm-only ID
        // and lets the playlist route parse it back into title and
        // artist when it needs to search for the track elsewhere.
        id: item.mbid || `lastfm:${item.name}|${item.artist}`,

        title: item.name,
        artist: item.artist,

        // Last.fm's track.search endpoint doesn't return album or
        // year — those fields only come from track.getInfo. Making use
        // empty defaults here so the shape is consistent.
        album: "Unknown",
        year: "",

        // Last.fm returns images at several sizes; index 3 is the
        // "extralarge" variant. Optional chaining protects against
        // missing image arrays.
        image: item.image?.[3]?.["#text"] || null,

        // `listeners` is a rough popularity signal Last.fm returns
        // on each result. Defaults to 0 when absent.
        listeners: item.listeners || 0,

        // Tag the source so the UI can show "via Last.fm" etc.
        source: "Last.fm",
      }));
    }

    // Response was valid but contained no trackmatches array.
    return [];
  } catch (error) {
    // Network or API errors: log and return an empty array so callers
    // can continue with their fallback chain rather than crashing.
    console.error("❌ Last.fm search failed:", error.message);
    return [];
  }
}

/**
 * getTrackInfo
 * ------------------------------------------------------------
 * Fetch detailed info about a single track from Last.fm, including
 * album, release date, play count and top tags. This is a richer
 * view than `searchTracks` returns.
 *
 * @param {string} artist - Artist name
 * @param {string} track  - Track name
 * @returns {Object|null} Detailed track info or null on failure
 */
async function getTrackInfo(artist, track) {
  // Same key guard as above. Returns null instead of [] because this
  // function's contract is to return a single object or nothing.
  if (!LASTFM_API_KEY || LASTFM_API_KEY === "your_lastfm_api_key_here") {
    return null;
  }

  try {
    // Call Last.fm's track.getInfo method.
    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.getInfo",
        artist: artist,
        track: track,
        api_key: LASTFM_API_KEY,
        format: "json",
      },
      timeout: 10000,
    });

    // Defensive: only proceed if a `track` object came back.
    if (response.data && response.data.track) {
      const data = response.data.track;

      // Normalise into our common shape. Unlike track.search, this
      // endpoint returns album details, play count and top tags.
      return {
        id: data.mbid || `lastfm:${data.name}|${data.artist.name}`,
        title: data.name,
        artist: data.artist.name,

        // Album details are optional on Last.fm's side.
        album: data.album?.title || "Unknown",
        year: data.album?.release_date || "",
        image: data.album?.image?.[3]?.["#text"] || null,

        // Popularity and engagement metrics.
        listeners: data.listeners || 0,
        playcount: data.playcount || 0,

        // Extract just the tag names from Last.fm's verbose tag
        // structure (array of { name, url } objects).
        tags: data.toptags?.tag?.map((t) => t.name) || [],
      };
    }

    // Valid response, but no track object — treat as not found.
    return null;
  } catch (error) {
    // Log and return null so callers can decide how to proceed.
    console.error("❌ Last.fm track info failed:", error.message);
    return null;
  }
}

// Export both public functions for use by the search route and any
// other service that needs track details.
module.exports = { searchTracks, getTrackInfo };
