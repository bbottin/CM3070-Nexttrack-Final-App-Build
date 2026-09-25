// src/services/reccobeats.js

// Import axios for making HTTP requests to the ReccoBeats API.
const axios = require("axios");

// ReccoBeats' public API base URL. All endpoints are appended to this.
const BASE_URL = "https://api.reccobeats.com";

/**
 * extractSpotifyId
 * ------------------------------------------------------------
 * Normalise a Spotify identifier from various formats into a bare
 * 22-character base62 Spotify track ID.
 *
 * Handles:
 *   - Spotify URIs       (spotify:track:XXXXXXXX)
 *   - Spotify share URLs (open.spotify.com/track/XXXXXXXX)
 *   - Bare 22-char IDs   (already the desired format)
 *
 * Any input that doesn't match one of those formats is returned
 * unchanged — this lets free-text queries (e.g., "Steve Aoki") pass
 * through without being mangled.
 */
function extractSpotifyId(input) {
  if (!input) return null;

  // Case 1: canonical Spotify URI.
  if (input.startsWith("spotify:track:")) {
    return input.split(":")[2];
  }

  // Case 2: Spotify share URL.
  if (input.includes("open.spotify.com/track/")) {
    const match = input.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  // Case 3: already a bare 22-char ID.
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) {
    return input;
  }

  // Case 4: unrecognised format — return unchanged.
  return input;
}

/**
 * spotifyIdFromHref
 * ------------------------------------------------------------
 * Extract the real, playable Spotify track ID from a ReccoBeats
 * `href` field. ReccoBeats responses embed the canonical Spotify
 * link in this field — it is the ONLY reliable place to get a
 * playable Spotify ID from a ReccoBeats response, because ReccoBeats'
 * own track IDs are internal UUIDs that the Spotify embed cannot use.
 *
 * Example:
 *   "https://open.spotify.com/track/00aqkszH1FdUiJJWvX6iEl"
 *   → "00aqkszH1FdUiJJWvX6iEl"
 */
function spotifyIdFromHref(href) {
  if (!href) return null;
  // Match exactly 22 base62 characters after "track/".
  const match = href.match(/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

/**
 * getTrackById
 * ------------------------------------------------------------
 * Fetch a single track's details by ID. Primarily used by the
 * /api/track/:id route.
 *
 * Resolution strategy:
 *   1. Normalise the ID and look it up via ReccoBeats search.
 *   2. If not found, fall back to the local sample dataset.
 *
 * The ReccoBeats search endpoint does NOT return audio features
 * (energy, valence, etc.), so this function supplies sensible
 * defaults for those fields to keep the response shape stable
 * for callers.
 */
async function getTrackById(trackId) {
  try {
    console.log(`🔍 Fetching track from ReccoBeats: ${trackId}`);

    // Normalise the incoming ID, then search ReccoBeats for it.
    const cleanId = extractSpotifyId(trackId);
    const searchResult = await searchTrack(cleanId || trackId);

    if (searchResult) {
      // Build a full track record with default audio features.
      // The search endpoint doesn't provide these, then use
      // neutral mid-range defaults rather than leaving them null.
      return {
        id: searchResult.reccobeatsId,
        spotifyId: searchResult.spotifyId,
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

    // Fallback: check the local sample dataset.
    const sampleTracks = require("../data/sampleTracks.json");
    if (sampleTracks[trackId] || sampleTracks[cleanId]) {
      const track = sampleTracks[trackId] || sampleTracks[cleanId];
      return { ...track, id: trackId || cleanId };
    }

    // Not found anywhere.
    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch track ${trackId}:`, error.message);
    return null;
  }
}

/**
 * searchTrack
 * ------------------------------------------------------------
 * Look up a track in ReccoBeats by its Spotify ID.
 *
 * IMPORTANT IMPLEMENTATION NOTE:
 * `/v1/track/search` is a FUZZY TEXT search endpoint, not an
 * exact-ID lookup. Passing a raw Spotify ID as `searchText` used to
 * be trusted blindly, which let ReccoBeats' fuzzy matcher return a
 * completely unrelated track (matched on stray characters in the
 * ID) while keep labelling it with the ORIGINAL spotifyId. That
 * is how a track's title/artist could end up attached to the wrong
 * Spotify ID in earlier versions.
 *
 * To prevent this, it now verifies that the returned result's own
 * `href` actually contains the Spotify ID that was asked for. Only
 * exact matches are accepted.
 */
async function searchTrack(spotifyId) {
  try {
    console.log(`🔍 Searching ReccoBeats for Spotify ID: ${spotifyId}`);

    const response = await axios.get(`${BASE_URL}/v1/track/search`, {
      params: {
        searchText: spotifyId,
        limit: 5, // fetch several so an exact match can be picked
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
      // Find a result whose own Spotify href matches the requested ID.
      // This is the crucial validation step that prevents mismatches.
      const match = response.data.content.find(
        (track) => spotifyIdFromHref(track.href) === spotifyId,
      );

      if (!match) {
        console.warn(
          `⚠️ ReccoBeats search for ${spotifyId} returned no exact match (fuzzy results discarded to avoid mismatched track)`,
        );
        return null;
      }

      console.log(`✅ Found ReccoBeats ID: ${match.id}`);
      return {
        reccobeatsId: match.id,
        title: match.trackTitle,
        artist: match.artists?.[0]?.name || "Unknown Artist",
        // Prefer the ID from the href (it's the source of truth for the
        // Spotify ID); fall back to the requested ID if extraction failed.
        spotifyId: spotifyIdFromHref(match.href) || spotifyId,
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
 * getRecommendations
 * ------------------------------------------------------------
 * Fetch a list of recommended tracks from ReccoBeats, seeded by a
 * set of ReccoBeats IDs.
 *
 * @param {Array<string>} reccobeatsIds - Seed IDs (ReccoBeats UUIDs)
 * @param {number}        size          - Number of recommendations
 * @param {Object}        filters       - Optional audio feature filters
 * @returns {Array}       Normalised recommendation objects
 */
async function getRecommendations(reccobeatsIds, size = 10, filters = {}) {
  try {
    // Guard: the endpoint requires at least one seed ID.
    if (!reccobeatsIds || reccobeatsIds.length === 0) {
      console.error("❌ No ReccoBeats IDs provided");
      return [];
    }

    console.log(
      `🎵 Getting recommendations from ReccoBeats for IDs: ${reccobeatsIds.join(", ")}`,
    );

    // Build the query parameters. `size` is capped at 100 (ReccoBeats'
    // documented maximum) and any extra filters (energy, valence,
    // popularity) are spread in as additional query params.
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
        // The real, playable Spotify ID - extracted from href.
        // This used to be dropped entirely, so every recommended track
        // fell back to ReccoBeats' internal UUID as its "id", which the
        // Spotify player can't use.
        spotifyId: spotifyIdFromHref(item.href),
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
 * searchTracksByText
 * ------------------------------------------------------------
 * Perform a free-text search against ReccoBeats (e.g., "Steve Aoki"
 * or "Bohemian Rhapsody Queen").
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
        // Real, playable Spotify ID extracted from href.
        // This was missing entirely before, which meant search results
        // could not be played and were often unusable as seeds.
        spotifyId: spotifyIdFromHref(track.href),
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

/**
 * searchTracksByTextSmart
 * ------------------------------------------------------------
 * Wrapper around searchTracksByText that retries with a simplified
 * query when the first attempt returns nothing.
 *
 * CONFIRMED VIA TESTING:
 * ReccoBeats' fuzzy matcher can fail on a combined "Artist - Title"
 * or "Artist Title" query even when the bare title alone matches
 * immediately. For example:
 *   - "Foo Fighters Everlong"     → 0 results
 *   - "Foo Fighters - Everlong"   → 0 results
 *   - "Everlong"                  → correct Foo Fighters track as #1
 *
 * When the query contains a common artist/title separator, it splits
 * and try each side alone BEFORE falling back to the combined query.
 */
async function searchTracksByTextSmart(query, limit = 10) {
  // Common artist/title separators found in real search input.
  const separators = [" - ", " – ", " — ", " + ", " | "];
  const matchedSep = separators.find((sep) => query.includes(sep));

  if (matchedSep) {
    // Split on the separator, trim and drop empty entries.
    const parts = query
      .split(matchedSep)
      .map((p) => p.trim())
      .filter(Boolean);

    // Try each segment ALONE — and in REVERSE order, because titles
    // are typically the second element ("Artist - Title") and titles
    // are the more distinctive search term.
    //
    // Why this order matters:
    //   - Combined "Artist - Title" strings frequently return ZERO
    //     results ("Foo Fighters - Everlong").
    //   - Or worse, they return a wrong/unrelated artist matched
    //     on stray words ("Nirvana - Smells Like Teen Spirit" once
    //     matched an artist called "Michael Pan").
    // Searching the bare title alone avoided both problems in testing,
    // so it's tried FIRST rather than as a last resort.
    for (const part of [...parts].reverse()) {
      if (!part) continue;
      console.log(
        `🔍 Trying simplified query first: "${part}" (from "${query}")`,
      );
      const results = await searchTracksByText(part, limit);
      if (results && results.length > 0) return results;
    }
  }

  // Fall back to the full combined query if no single segment matched.
  return await searchTracksByText(query, limit);
}

/**
 * searchTrackByTitleAndArtist
 * ------------------------------------------------------------
 * Look up a track when its title and artist are known separately
 * (as opposed to one free-text string).
 *
 * Strategy:
 *   1. Search by title alone (via the smart wrapper).
 *   2. Filter the results to find one whose artist actually matches
 *      the artist that were given.
 *   3. Only accept a top result blindly if no artist-matched result
 *      exists — and log a warning when that happens.
 *
 * This explicit artist check prevents the previous behaviour of
 * blindly trusting whichever result came back first, which let a
 * wrong artist ("Michael Pan" for a Nirvana search) slip through.
 */
async function searchTrackByTitleAndArtist(title, artist, limit = 5) {
  if (!title) return null;

  const results = await searchTracksByTextSmart(title, limit);
  if (!results || results.length === 0) return null;

  // If an artist was provided, look for a result whose artist matches
  // (in either direction, so "Nirvana" matches "Nirvana (band)" too).
  if (artist) {
    const artistLower = artist.toLowerCase();
    const match = results.find(
      (r) =>
        r.artist &&
        (r.artist.toLowerCase().includes(artistLower) ||
          artistLower.includes(r.artist.toLowerCase())),
    );
    if (match) return match;

    // No artist match — warn and fall through to the top result.
    console.warn(
      `⚠️ No ReccoBeats result for "${title}" matched artist "${artist}" - top result was "${results[0].artist}" instead, using it anyway`,
    );
  }

  // Return the best available result when no artist filter was given,
  // or when nothing matched but still want something back.
  return results[0];
}

// Export all public functions for use by routes and other services.
module.exports = {
  getRecommendations,
  searchTrack,
  searchTracksByText,
  searchTracksByTextSmart,
  searchTrackByTitleAndArtist,
  getTrackById,
  extractSpotifyId,
  spotifyIdFromHref,
};
