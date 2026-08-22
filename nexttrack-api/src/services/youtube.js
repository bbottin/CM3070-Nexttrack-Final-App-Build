// src/services/youtube.js

/**
 * Search YouTube for a track - returns a search URL directly
 * No external API calls needed - completely reliable
 */
async function searchYouTube(query, limit = 1) {
  console.log(`🔍 Generating YouTube search URL for: "${query}"`);

  // Create a YouTube search URL
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // Return a search URL that the frontend can open
  return [
    {
      videoId: null,
      searchUrl: searchUrl,
      note: "Click to search YouTube for this track",
    },
  ];
}

/**
 * Get YouTube embed URL for a video ID
 */
function getYouTubeEmbedUrl(videoId) {
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Get YouTube thumbnail URL for a video ID
 */
function getYouTubeThumbnail(videoId, quality = "mqdefault") {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

module.exports = { searchYouTube, getYouTubeEmbedUrl, getYouTubeThumbnail };
