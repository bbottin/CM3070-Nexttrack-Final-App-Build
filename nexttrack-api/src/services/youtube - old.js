// src/services/youtube.js

const axios = require("axios");

/**
 * Search YouTube for a track
 * @param {string} query - Track name + artist
 * @param {number} limit - Max results (default: 1)
 * @returns {Array} Video results
 */
async function searchYouTube(query, limit = 1) {
  try {
    // Using YouTube's oEmbed or public search
    // Note: For production, use YouTube Data API with API key
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          maxResults: limit,
          key: process.env.YOUTUBE_API_KEY || "", // Optional: add your key
          videoEmbeddable: "true",
        },
        timeout: 5000,
      },
    );

    if (response.data && response.data.items) {
      return response.data.items.map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        channel: item.snippet.channelTitle,
      }));
    }
    return [];
  } catch (error) {
    console.warn(`YouTube search failed for "${query}": ${error.message}`);
    // Fallback: use YouTube embed with search query
    return [
      {
        videoId: null,
        searchQuery: query,
        note: "YouTube Data API key not configured. Using fallback.",
      },
    ];
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
