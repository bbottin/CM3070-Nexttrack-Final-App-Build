// src/services/reccobeats.js
//
// All communication with the ReccoBeats API (audio-feature/track database +
// recommendation engine, no auth required). This file has a real debugging
// history worth knowing before changing it further:
//
// - ReccoBeats track objects carry NO genre field at all (confirmed by
//   inspecting raw API responses) - only trackTitle, artists, durationMs,
//   isrc, href, popularity. Genre-aware matching is not possible against
//   this API alone; see lastfm.js's getTrackInfo() for a real (but unused)
//   genre/tag source.
// - getRecommendations() below has been directly verified (via curl,
//   bypassing this codebase entirely) to return different, often
//   genre-unrelated results for the SAME seed IDs on repeated calls. Both
//   comma-joined (`seeds=a,b`) and repeated-key (`seeds=a&seeds=b`) formats
//   were tested and behave the same way - this is not a request-format bug,
//   it looks like an inherent limitation of ReccoBeats' free recommendation
//   endpoint (pure audio-feature nearest-neighbour, no genre awareness).
// - getTrackById() below returns HARDCODED placeholder audio features
//   (energy: 0.5, valence: 0.5, tempo: 120, ...) instead of calling
//   ReccoBeats' real GET /v1/track/:id/audio-features endpoint. Anything
//   depending on real feature values (e.g. services/similarity.js, if it's
//   ever wired in) will see identical fake numbers for every track until
//   this is fixed.

const axios = require("axios");

// ReccoBeats API base URL. All endpoints are appended to this.
const BASE_URL = "https://api.reccobeats.com";

/**
 * extractSpotifyId
 * ------------------------------------------------------------
 * Extract a clean 22-character Spotify track ID from a URI, URL,
 * or already-clean ID.
 *
 * Handles:
 *   - Spotify URIs       ("spotify:track:XXXXX")
 *   - Spotify share URLs (open.spotify.com/track/XXXXX)
 *   - Bare 22-char IDs   (already the desired format)
 *
 * Unrecognised input is returned unchanged, so callers always get
 * a string back even if it isn't a valid Spotify ID.
 *
 * @param {string} input - Spotify URI, URL, or raw ID
 * @returns {string|null} Clean Spotify track ID, or null if input was falsy
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

  // Case 4: unrecognised format - return unchanged.
  return input;
}

/**
 * spotifyIdFromHref
 * ------------------------------------------------------------
 * Extract a real Spotify track ID from a ReccoBeats `href` field.
 *
 * Example:
 *   "https://open.spotify.com/track/00aqkszH1FdUiJJWvX6iEl"
 *   -> "00aqkszH1FdUiJJWvX6iEl"
 *
 * The `href` field is the ONLY reliable place to get a playable
 * Spotify ID from a ReccoBeats response - ReccoBeats' own internal
 * IDs are not usable by the Spotify embed.
 *
 * @param {string} href - A ReccoBeats `href` field value
 * @returns {string|null} The extracted 22-char Spotify ID, or null
 */
function spotifyIdFromHref(href) {
  if (!href) return null;
  const match = href.match(/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

/**
 * getTrackById
 * ------------------------------------------------------------
 * Fetch a track's details from ReccoBeats by ID (used by track.js).
 * This replaces the removed fetchTrackFeatures.
 *
 * WARNING: see the file-level note - the returned audio feature
 * values (energy, valence, tempo, etc.) are HARDCODED placeholders,
 * not real features from ReccoBeats. Any consumer relying on real
 * feature values will see identical numbers for every track until
 * this is wired up to ReccoBeats' /v1/track/:id/audio-features
 * endpoint.
 *
 * Resolution strategy:
 *   1. Normalise the ID and look it up via ReccoBeats search.
 *   2. If not found, fall back to the local sample dataset.
 *
 * @param {string} trackId - Spotify ID, Spotify URI/URL, or ReccoBeats ID
 * @returns {Promise<Object|null>} Track details (with fake audio features) or null if not found anywhere
 */
async function getTrackById(trackId) {
  try {
    console.log(`🔍 Fetching track from ReccoBeats: ${trackId}`);

    // Normalise the ID, then look it up in ReccoBeats.
    const cleanId = extractSpotifyId(trackId);
    const searchResult = await searchTrack(cleanId || trackId);

    if (searchResult) {
      // Build a full track record with placeholder audio features.
      // The search endpoint doesn't return real features, so these
      // are hardcoded defaults (see WARNING above).
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

    // If not found in ReccoBeats, check the local sample dataset.
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
 * Look up a specific track in ReccoBeats by its Spotify ID,
 * verifying the match is genuine.
 *
 * IMPORTANT: /v1/track/search is a FUZZY TEXT search endpoint.
 * Passing a raw Spotify ID as `searchText` used to be trusted
 * blindly, which let ReccoBeats' fuzzy matcher return a
 * completely unrelated track (matched on stray characters in the
 * ID) while the original spotifyId was still being used as the
 * label. That's how a track's title/artist could end up attached
 * to the wrong Spotify ID in earlier versions.
 *
 * The fix verifies that the result's own `href` actually contains
 * the ID being searched for. Only exact matches are accepted.
 *
 * @param {string} spotifyId - Clean 22-character Spotify track ID
 * @returns {Promise<Object|null>} {reccobeatsId, title, artist, spotifyId} or null if no verified match found
 */
async function searchTrack(spotifyId) {
  try {
    console.log(`🔍 Searching ReccoBeats for Spotify ID: ${spotifyId}`);

    const response = await axios.get(`${BASE_URL}/v1/track/search`, {
      params: {
        searchText: spotifyId,
        // Fetch several results so the one that exactly matches the
        // requested ID can be picked out.
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
      // Look for a result whose own Spotify href actually matches
      // the ID being searched for. This is the crucial validation
      // step that prevents the fuzzy-mismatch bug described above.
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
        // Prefer the ID from the href (source of truth); fall back to
        // the requested ID if extraction failed.
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
 * WARNING: see the file-level note - this endpoint has been
 * observed to return different, often genre-unrelated results for
 * identical seeds across repeated calls. Treat its output as
 * "audio-feature-adjacent, not genre-reliable" rather than
 * assuming consistency.
 *
 * @param {Array<string>} reccobeatsIds - ReccoBeats track IDs to use as seeds
 * @param {number} [size=10] - Desired result count (capped at 100)
 * @param {Object} [filters={}] - Optional audio-feature filters (energy, valence, popularity).
 *                                Note: currently these are always undefined in practice - the
 *                                routes only pass through mood/genre/discovery, never these.
 * @returns {Promise<Array<Object>>} Recommended tracks (with spotifyId from href), or [] on failure
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

    const params = {
      seeds: reccobeatsIds.join(","),
      // ReccoBeats caps `size` at 100.
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
        // The real, playable Spotify ID - extracted from href. This
        // used to be dropped entirely, so every recommended track
        // fell back to ReccoBeats' internal UUID as its "id",
        // which the Spotify player can't use.
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
 * Perform a raw free-text search against ReccoBeats.
 *
 * This is the low-level primitive. Prefer searchTracksByTextSmart()
 * or searchTrackByTitleAndArtist() in new code, since this function
 * alone is known to fuzzy-match poorly on combined "Artist - Title"
 * strings.
 *
 * @param {string} query - Free-text search query (e.g., "Steve Aoki")
 * @param {number} [limit=10] - Max results
 * @returns {Promise<Array<Object>>} Matching tracks (with spotifyId), or [] on failure/no results
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
        // Real, playable Spotify ID extracted from href. This was
        // missing entirely in an earlier version, which meant search
        // results could not be played and were often unusable as seeds.
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
 * Search ReccoBeats by text, using cross-validation to avoid
 * blindly trusting generic or unrelated fuzzy matches.
 *
 * Background from direct testing:
 * ReccoBeats' fuzzy matcher can fail on a combined
 * "Artist - Title" / "Artist Title" query even when the bare title
 * alone matches immediately - e.g. "Foo Fighters Everlong" and
 * "Foo Fighters - Everlong" both returned zero results, while
 * "Everlong" alone returned the correct Foo Fighters track as the
 * #1 hit.
 *
 * When a query has a separator (e.g. "X - Y"), there is no reliable
 * way to know whether X or Y is the title vs. the artist - queries
 * arrive in both orders in practice. An earlier version of this
 * function guessed "the second segment is probably the title" and
 * stopped at the first segment that returned ANY result - but a
 * bare artist name (e.g. just "Nirvana") almost always returns
 * something, so that guess could lock onto a generic, unrelated
 * result set before ever trying the actual title. (Confirmed:
 * searching "Smells Like Teen Spirit - Nirvana" stopped at
 * "Nirvana" alone and never tried the song title at all.)
 *
 * Fix: both segments are searched, then cross-validated - a
 * candidate only counts as a real match if the OTHER segment's text
 * actually appears in that candidate's title or artist. This works
 * regardless of which order the title/artist were typed in, and
 * avoids trusting a lucky-but-irrelevant hit from either segment
 * alone.
 *
 * @param {string} query - Free-text query, optionally containing an "Artist - Title" separator
 * @param {number} [limit=10] - Max results
 * @returns {Promise<Array<Object>>} Matching tracks (with `verified` flag), or [] if nothing found
 */
async function searchTracksByTextSmart(query, limit = 10) {
  const separators = [" - ", " – ", " — ", " + ", " | "];
  const matchedSep = separators.find((sep) => query.includes(sep));

  if (matchedSep) {
    const parts = query
      .split(matchedSep)
      .map((p) => p.trim())
      .filter(Boolean);

    // Cross-validation only makes sense with exactly two halves -
    // e.g. "Title - Artist". Three or more segments are ambiguous.
    if (parts.length === 2) {
      const [partA, partB] = parts;
      console.log(
        `🔍 Searching both segments of "${query}": "${partA}" and "${partB}"`,
      );

      // Search both halves in parallel for speed.
      const [resultsA, resultsB] = await Promise.all([
        searchTracksByText(partA, Math.max(limit, 5)),
        searchTracksByText(partB, Math.max(limit, 5)),
      ]);

      // Strip apostrophes/quotes/punctuation before comparing - e.g.
      // the real title "Summer of '69" would never match a plain
      // substring check against the typed query "Summer of 69" (the
      // apostrophe sits right in the middle of the digits), even
      // though they clearly refer to the same song. Normalising both
      // sides before comparing avoids this class of false negative.
      const normalize = (s) =>
        (s || "")
          .toLowerCase()
          .replace(/['’‘"“”]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();

      const containsText = (candidate, text) => {
        const haystack = normalize(
          `${candidate.title || ""} ${candidate.artist || ""}`,
        );
        return haystack.includes(normalize(text));
      };

      // A result from searching partA alone is only trustworthy if
      // partB's text ALSO shows up in it (and vice versa) - that
      // confirms the result actually relates to BOTH halves of the
      // original query, not just one generic/broad segment.
      const confirmed = [
        ...(resultsA || []).filter((r) => containsText(r, partB)),
        ...(resultsB || []).filter((r) => containsText(r, partA)),
      ];

      if (confirmed.length > 0) {
        console.log(
          `✅ Cross-validated match(es) for "${query}" via segment search`,
        );
        // Cross-validated against BOTH halves - high confidence.
        return confirmed.slice(0, limit).map((r) => ({ ...r, verified: true }));
      }

      // Nothing cross-validated - fall back to whichever segment
      // actually returned something, but log this clearly since these
      // are unconfirmed (may be as generic as a bare artist-name search).
      if (
        (resultsA && resultsA.length > 0) ||
        (resultsB && resultsB.length > 0)
      ) {
        console.log(
          `⚠️ No cross-validated match for "${query}" - falling back to unconfirmed segment results`,
        );
        return (resultsA && resultsA.length > 0 ? resultsA : resultsB)
          .slice(0, limit)
          .map((r) => ({ ...r, verified: false }));
      }
    }
  }

  // Fall back to the full combined query if segment search found
  // nothing at all - this only ever matched the ENTIRE query as one
  // fuzzy string, so there's no cross-validation to speak of; treat
  // as unverified.
  const fallbackResults = await searchTracksByText(query, limit);
  return (fallbackResults || []).map((r) => ({ ...r, verified: false }));
}

/**
 * searchTrackByTitleAndArtist
 * ------------------------------------------------------------
 * Look up a track when its title and artist are known separately
 * (as opposed to one free-text query).
 *
 * Strategy:
 *   1. Search by title alone (via the smart wrapper above).
 *   2. Filter the results to find one whose artist actually matches
 *      the artist being looked for.
 *   3. Only fall back to blindly trusting the top result when no
 *      artist-matched result exists - and log a warning when that
 *      happens.
 *
 * This explicit artist check prevents the earlier behaviour of
 * blindly trusting whichever result came back first, which let a
 * wrong artist ("Michael Pan" for a Nirvana search) slip through.
 *
 * @param {string} title - Track title to search for
 * @param {string} [artist] - Artist to validate against; if omitted, top result is trusted as-is
 * @param {number} [limit=5] - How many candidates to consider when looking for an artist match
 * @returns {Promise<Object|null>} Best-matching track, or null if nothing found
 */
async function searchTrackByTitleAndArtist(title, artist, limit = 5) {
  if (!title) return null;

  const results = await searchTracksByTextSmart(title, limit);
  if (!results || results.length === 0) return null;

  if (artist) {
    const artistLower = artist.toLowerCase();
    // Match in either direction so "Nirvana" matches "Nirvana (band)"
    // and vice versa.
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

  // Fall back to the top result when no artist filter was given, or
  // when nothing matched.
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
