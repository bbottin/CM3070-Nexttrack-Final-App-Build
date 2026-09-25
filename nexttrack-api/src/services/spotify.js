// src/services/spotify.js

// Import axios for making HTTP requests.
const axios = require("axios");

// ---------------------------------------------------------------------------
// DESIGN NOTE
// ---------------------------------------------------------------------------
// This module is a FALLBACK, not a full Spotify Web API client.
//
// A production-grade Spotify integration would use OAuth 2.0 and the
// official Spotify Web API endpoints. However, NextTrack's design goal
// is to avoid requiring users or the project owner to sign up for a
// paid Spotify account just to resolve track IDs.
//
// Instead, this module attempts to derive a Spotify-compatible ID by
// querying MusicBrainz (which is free and open) and extracting the
// ISRC code from the response. This is a pragmatic shortcut: it will
// not always succeed and the ISRC returned is not itself a Spotify
// track ID, but for many well-known recordings it's a workable
// signal that downstream code can use to disambiguate tracks.
//
// If this module fails, the caller should fall back to the local
// sample dataset or to the YouTube search URL path.
// ---------------------------------------------------------------------------

/**
 * findSpotifyId
 * ------------------------------------------------------------
 * Attempt to find a Spotify-compatible identifier for a track by
 * querying MusicBrainz and extracting the ISRC code.
 *
 * @param {string} title  - Track title (e.g., "Bohemian Rhapsody")
 * @param {string} artist - Artist name (e.g., "Queen")
 * @returns {string|null} The ISRC string if found, otherwise null
 */
async function findSpotifyId(title, artist) {
  try {
    // Query MusicBrainz's /recording search endpoint. This is a
    // free, unauthenticated service, so no API key is required —
    // but MusicBrainz does require a descriptive User-Agent header.
    const mbResponse = await axios.get(
      "https://musicbrainz.org/ws/2/recording",
      {
        params: {
          // Lucene-style query: match on the exact title AND the
          // exact artist. Quoting both terms forces exact-phrase
          // matching rather than loose token matching.
          query: `"${title}" AND artist:"${artist}"`,
          fmt: "json",
          limit: 1, // Only the top result is needed
        },
        headers: {
          // MusicBrainz requires an identifying User-Agent.
          // Format: AppName/Version (ContactURL)
          "User-Agent":
            "NextTrackAPI/1.0 (https://github.com/yourusername/nexttrack)",
        },
        timeout: 5000, // 5s timeout — MusicBrainz can be slow
      },
    );

    // Defensive: check every level of the nested response shape
    // before accessing the recordings array.
    if (
      mbResponse.data &&
      mbResponse.data.recordings &&
      mbResponse.data.recordings.length > 0
    ) {
      const recording = mbResponse.data.recordings[0];

      // Look for the ISRC (International Standard Recording Code) —
      // a globally unique identifier for a specific recording.
      // Optional chaining protects against missing isrcs array.
      const isrc = recording.isrcs?.[0] || null;

      if (isrc) {
        // NOTE: This is a simplified approach. ISRCs are NOT the
        // same as Spotify track IDs — they identify recordings,
        // whereas Spotify IDs identify Spotify's catalogue entries.
        // It returns the ISRC as a best-effort proxy; downstream
        // code that treats this as a Spotify ID should be aware
        // that the value may not resolve in the Spotify player.
        return isrc;
      }
    }

    // No recordings found or no ISRC available.
    return null;
  } catch (error) {
    // Log a warning with the query context so failures can be traced,
    // then return null so the caller can fall back to another source.
    console.warn(
      `Failed to find Spotify ID for "${title} - ${artist}":`,
      error.message,
    );
    return null;
  }
}

/**
 * isSpotifyId
 * ------------------------------------------------------------
 * Heuristic check for whether a given string looks like a valid
 * Spotify track ID. Accepts three common formats:
 *
 *   - Spotify URI:       spotify:track:XXXXXXXX
 *   - Spotify share URL: https://open.spotify.com/track/XXXXXXXX
 *   - Bare base62 ID:    22 alphanumeric characters (with - and _)
 *
 * @param {string} id - The ID or identifier to check
 * @returns {boolean} True if the input looks like a Spotify ID
 */
function isSpotifyId(id) {
  return (
    id &&
    (id.startsWith("spotify:track:") ||
      id.startsWith("https://open.spotify.com/track/") ||
      // Spotify track IDs are always 22 characters of base62
      // (letters, digits, hyphen, underscore).
      (id.length === 22 && /^[a-zA-Z0-9_-]{22}$/.test(id)))
  );
}

/**
 * extractSpotifyId
 * ------------------------------------------------------------
 * Normalise a Spotify identifier from various input formats into
 * a bare 22-character base62 ID.
 *
 * Handles:
 *   - Bare IDs   (returned unchanged)
 *   - URIs       (spotify:track:XXXXXXXX → XXXXXXXX)
 *   - Share URLs (open.spotify.com/track/XXXXXXXX → XXXXXXXX)
 *
 * Any input that doesn't match one of those formats is returned
 * unchanged — this lets free-text queries or foreign IDs pass
 * through without being mangled.
 *
 * @param {string} input - Spotify URI, share URL, bare ID, or other string
 * @returns {string|null} The extracted 22-char ID, or the original
 *                        input if it doesn't match a known format
 */
function extractSpotifyId(input) {
  if (!input) return null;

  // Case 1: already a bare 22-char base62 ID — return as-is.
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) {
    return input;
  }

  // Case 2: canonical Spotify URI.
  if (input.startsWith("spotify:track:")) {
    return input.split(":")[2];
  }

  // Case 3: Spotify share URL — extract the ID from the path.
  if (input.includes("open.spotify.com/track/")) {
    const match = input.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  // Case 4: unrecognised format — return unchanged so callers can
  // still attempt to use the original value.
  return input;
}

// Export the three public helpers for use by other services and routes.
module.exports = { findSpotifyId, isSpotifyId, extractSpotifyId };
