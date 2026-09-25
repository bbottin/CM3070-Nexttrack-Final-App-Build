// src/services/musicbrainz.js

// Import axios for making HTTP requests to the MusicBrainz API.
const axios = require("axios");

// MusicBrainz's public Web Service v2 base URL.
// All requests go through this root, with endpoints appended
// (e.g., /track/{id}, /recording/{id}).
const BASE_URL = "https://musicbrainz.org/ws/2";

/**
 * fetchTrackMetadata
 * ------------------------------------------------------------
 * Fetch detailed metadata for a single track from MusicBrainz.
 *
 * MusicBrainz is a free, open music encyclopaedia maintained by
 * the community. Unlike ReccoBeats or Spotify, it does not provide
 * audio features (energy, valence, tempo) — it focuses on
 * descriptive metadata (title, artist credits, releases, etc.).
 *
 * This function is currently a utility helper and is not wired
 * into the main NextTrack flow, but it is kept for potential use
 * in enriching track metadata in future iterations.
 *
 * @param {string} trackId - A MusicBrainz track ID (MBID, a UUID)
 * @returns {Object|null}   Normalised track metadata or null on
 *                          failure / not found
 */
async function fetchTrackMetadata(trackId) {
  try {
    // Query MusicBrainz's /track/{id} endpoint.
    const response = await axios.get(`${BASE_URL}/track/${trackId}`, {
      params: {
        // Request JSON rather than the default XML response.
        fmt: "json",

        // `inc` controls which related entities to include.
        // Here it asks for artist credits (names) and releases
        // (albums). Multiple values are joined with "+".
        inc: "artist-credits+releases",
      },
      timeout: 5000, // 5s timeout — MusicBrainz can be slow under load

      // MusicBrainz REQUIRES a descriptive User-Agent header on every
      // request. Requests without one are rate-limited aggressively or
      // outright rejected. The format they ask for is:
      //   AppName/Version (ContactURL)
      headers: {
        "User-Agent":
          "NextTrackAPI/1.0 (https://github.com/yourusername/nexttrack)",
      },
    });

    const data = response.data;

    // Defensive: only build the normalised object if MusicBrainz
    // actually returned a track with an id.
    if (data && data.id) {
      return {
        id: data.id,
        title: data.title,

        // MusicBrainz returns artist credits as an array of objects.
        // The first entry's `name` is usually the primary artist.
        // Optional chaining protects against missing fields.
        artist: data["artist-credit"]?.[0]?.name || "Unknown",

        // Releases are albums. First one is taken for simplicity.
        album: data.releases?.[0]?.title || "Unknown Album",

        // NOTE: MusicBrainz has no direct equivalent of a "genre"
        // field on tracks. A placeholder is returned ("pop") rather
        // than nothing, so downstream code doesn't break on a
        // missing field. Real genre data would require querying
        // MusicBrainz's separate "tags" or "genres" relationships.
        genre: "pop",

        // Releases have a `date` field in "YYYY-MM-DD" format.
        // Split on "-" and take the year part, defaulting to
        // "2020" if the release or date is missing.
        year: data.releases?.[0]?.date?.split("-")[0] || "2020",
      };
    }

    // Valid response but no track object — treat as not found.
    return null;
  } catch (error) {
    // Network or API errors: log a warning with the track ID so the
    // failure can be traced, and return null. Callers can then fall
    // back to another metadata source (e.g., ReccoBeats or sample data).
    console.warn(`MusicBrainz fetch failed for ${trackId}: ${error.message}`);
    return null;
  }
}

// Export the function so it can be imported by any route or service
// that needs MusicBrainz metadata.
module.exports = { fetchTrackMetadata };
