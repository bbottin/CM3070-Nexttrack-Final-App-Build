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
 * Extract a real Spotify track ID out of a ReccoBeats `href` field,
 * e.g. "https://open.spotify.com/track/00aqkszH1FdUiJJWvX6iEl" -> "00aqkszH1FdUiJJWvX6iEl"
 * ReccoBeats track objects carry the real Spotify link in `href` - this is the
 * only reliable place to get a playable Spotify ID from a ReccoBeats response.
 */
function spotifyIdFromHref(href) {
  if (!href) return null;
  const match = href.match(/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
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

    // NOTE: /v1/track/search is a fuzzy TEXT search endpoint. Passing a raw
    // Spotify ID as `searchText` used to be trusted blindly, which let ReccoBeats'
    // fuzzy matcher return a completely unrelated track (matched on stray
    // characters in the ID) while we kept labeling it with the ORIGINAL spotifyId.
    // That's how a track's title/artist could end up attached to the wrong
    // Spotify ID. We now verify the result's own href actually matches the ID
    // we asked for before trusting anything about it.
    const response = await axios.get(`${BASE_URL}/v1/track/search`, {
      params: {
        searchText: spotifyId,
        limit: 5,
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
      // Look for a result whose own Spotify href actually matches the ID we searched for.
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
        // The real, playable Spotify ID - extracted from href. This used to be
        // dropped entirely, so every recommended track fell back to ReccoBeats'
        // internal UUID as its "id", which the player can't use.
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
        // Real, playable Spotify ID extracted from href (was missing entirely before).
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
 * Search ReccoBeats by text, retrying with a simplified query if the first
 * attempt returns nothing.
 *
 * Confirmed via direct testing: ReccoBeats' fuzzy matcher can fail on a
 * combined "Artist - Title" / "Artist Title" query even when the bare title
 * alone matches immediately - e.g. "Foo Fighters Everlong" and
 * "Foo Fighters - Everlong" both returned zero results, while "Everlong"
 * alone returned the correct Foo Fighters track as the #1 hit. When the
 * query contains a common artist/title separator, retry using each side on
 * its own before giving up.
 */
async function searchTracksByTextSmart(query, limit = 10) {
  const separators = [" - ", " – ", " — ", " + ", " | "];
  const matchedSep = separators.find((sep) => query.includes(sep));

  if (matchedSep) {
    const parts = query
      .split(matchedSep)
      .map((p) => p.trim())
      .filter(Boolean);

    // Try each side ALONE, and try this before the combined query. A
    // combined "Artist - Title" string has repeatedly proven unreliable in
    // two different ways: returning zero results (e.g. "Foo Fighters -
    // Everlong"), or returning a real but WRONG/unrelated artist fuzzy-matched
    // on stray words (e.g. "Nirvana - Smells Like Teen Spirit" matched to an
    // artist called "Michael Pan"). Searching the bare title alone avoided
    // both problems in testing, so it's tried first rather than as a
    // last-resort fallback.
    for (const part of [...parts].reverse()) {
      if (!part) continue;
      console.log(
        `🔍 Trying simplified query first: "${part}" (from "${query}")`,
      );
      const results = await searchTracksByText(part, limit);
      if (results && results.length > 0) return results;
    }
  }

  // Fall back to the full combined query if no segment alone found anything.
  return await searchTracksByText(query, limit);
}

/**
 * Search for a track when title and artist are known separately (as opposed
 * to one free-text query). Searches by title alone (via the smart wrapper
 * above) and then explicitly picks whichever candidate's artist actually
 * matches the one being looked for, instead of blindly trusting whichever
 * result comes back first - which is what let a wrong artist ("Michael Pan"
 * for a Nirvana search) slip through even when *some* result came back.
 */
async function searchTrackByTitleAndArtist(title, artist, limit = 5) {
  if (!title) return null;

  const results = await searchTracksByTextSmart(title, limit);
  if (!results || results.length === 0) return null;

  if (artist) {
    const artistLower = artist.toLowerCase();
    const match = results.find(
      (r) =>
        r.artist &&
        (r.artist.toLowerCase().includes(artistLower) ||
          artistLower.includes(r.artist.toLowerCase())),
    );
    if (match) return match;
    console.warn(
      `⚠️ No ReccoBeats result for "${title}" matched artist "${artist}" - top result was "${results[0].artist}" instead, using it anyway`,
    );
  }

  return results[0];
}

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
