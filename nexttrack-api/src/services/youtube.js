// src/services/youtube.js

// ---------------------------------------------------------------------------
// DESIGN NOTE
// ---------------------------------------------------------------------------
// This module deliberately does NOT call the YouTube Data API or any
// third-party service (such as public Invidious instances).
//
// WHY:
// Earlier versions of NextTrack tried to resolve actual YouTube video
// IDs by querying public Invidious instances. This proved unreliable
// in practice — public instances frequently go down, rate-limit
// aggressively or return malformed responses, causing intermittent
// failures that were outside the project's control.
//
// The chosen approach instead returns a YouTube SEARCH URL that the
// frontend can open in a new tab. This is completely reliable (it
// depends only on YouTube's own public search page), requires no API
// key and gives the user a familiar, working experience. The
// trade-off is that the specific video ID is not known in advance,
// which is why the returned object has `videoId: null`.
// ---------------------------------------------------------------------------

/**
 * searchYouTube
 * ------------------------------------------------------------
 * Produce a YouTube search URL for a track.
 *
 * Despite the name ("search"), this function performs no network
 * request. It simply builds and returns a URL that, when opened,
 * runs the given query on YouTube's own search page.
 *
 * Always returns exactly one result object so callers can treat
 * the return value uniformly (a one-element array rather than a
 * possibly-empty one).
 *
 * @param {string} query - The search query (e.g., "Bohemian Rhapsody Queen official audio")
 * @param {number} limit - Unused; kept for API compatibility with the
 *                         earlier Invidious-based implementation that
 *                         supported variable result counts.
 * @returns {Array} A single-element array with { videoId, searchUrl, note }
 */
async function searchYouTube(query, limit = 1) {
  console.log(`🔍 Generating YouTube search URL for: "${query}"`);

  // Build a YouTube search URL. `encodeURIComponent` ensures special
  // characters (spaces, ampersands, non-ASCII text) are safely
  // percent-encoded so the URL remains valid.
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // Return a one-element array. `videoId` is intentionally null:
  // the specific video ID is not known, so the frontend must treat
  // this as a "search externally" result rather than an embeddable
  // video. The `note` field is a hint for the UI.
  return [
    {
      videoId: null,
      searchUrl: searchUrl,
      note: "Click to search YouTube for this track",
    },
  ];
}

/**
 * getYouTubeEmbedUrl
 * ------------------------------------------------------------
 * Build a YouTube iframe-compatible embed URL for a given video ID.
 *
 * Note: this function is currently UNUSED by the main NextTrack flow
 * because `searchYouTube` never returns a real videoId (see above).
 * It is retained as a utility for potential future use if a reliable
 * source of video IDs becomes available.
 *
 * @param {string} videoId - A YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns {string|null} Embed URL or null if no ID was provided
 */
function getYouTubeEmbedUrl(videoId) {
  // Guard: don't build a URL with an empty/null ID.
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * getYouTubeThumbnail
 * ------------------------------------------------------------
 * Build a thumbnail image URL for a given YouTube video ID.
 *
 * Note: like getYouTubeEmbedUrl, this is currently UNUSED by the main
 * flow for the same reason (no video ID is available). It is retained
 * as a utility for future use.
 *
 * @param {string} videoId - A YouTube video ID
 * @param {string} quality - Thumbnail size preset. YouTube's accepted values:
 *                           "default" | "mqdefault" | "hqdefault" |
 *                           "sddefault" | "maxresdefault"
 * @returns {string|null} Thumbnail URL, or null if no ID was provided
 */
function getYouTubeThumbnail(videoId, quality = "mqdefault") {
  // Guard: don't build a URL with an empty/null ID.
  if (!videoId) return null;
  // YouTube's thumbnail service follows a predictable URL pattern
  // based on the video ID and a quality label.
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

// Export the three helpers for use by routes and the frontend.
// In practice, only `searchYouTube` is consumed in the current flow —
// the other two remain available for future enhancements.
module.exports = { searchYouTube, getYouTubeEmbedUrl, getYouTubeThumbnail };
