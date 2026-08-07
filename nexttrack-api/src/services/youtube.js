// src/services/youtube.js

const axios = require("axios");

/**
 * Search YouTube for a track using oEmbed (free, no API key)
 * Note: oEmbed only works with known video URLs, not search
 * So we use a different approach: direct search with public endpoints
 */
async function searchYouTube(query, limit = 1) {
  try {
    // Use the public YouTube search RSS feed (no API key required)
    // This is a free, unofficial method
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    // Since we can't parse RSS easily, we'll use a different approach:
    // Use the Invidious API (free, no key)
    const invidiousResponse = await axios.get(
      "https://invidious.private.coffee/api/v1/search",
      {
        params: {
          q: query,
          type: "video",
          maxResults: limit,
        },
        timeout: 5000,
      },
    );

    if (invidiousResponse.data && Array.isArray(invidiousResponse.data)) {
      const results = invidiousResponse.data
        .filter((item) => item.type === "video")
        .map((item) => ({
          videoId: item.videoId,
          title: item.title,
          thumbnail: `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`,
          channel: item.author,
          duration: item.lengthSeconds,
        }));

      if (results.length > 0) {
        return results;
      }
    }

    // Fallback: Return null and let frontend handle it
    return [];
  } catch (error) {
    console.warn(`YouTube search failed for "${query}": ${error.message}`);
    return [];
  }
}

/**
 * Get YouTube embed URL for a video ID
 * @param {string} videoId - YouTube video ID
 * @returns {string} Embed URL
 */
function getYouTubeEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Get YouTube thumbnail URL for a video ID
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - 'default', 'hqdefault', 'mqdefault', 'sddefault', 'maxresdefault'
 * @returns {string} Thumbnail URL
 */
function getYouTubeThumbnail(videoId, quality = "mqdefault") {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

module.exports = { searchYouTube, getYouTubeEmbedUrl, getYouTubeThumbnail };
