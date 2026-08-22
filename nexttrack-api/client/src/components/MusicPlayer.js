// client/src/components/MusicPlayer.js

import React, { useState, useEffect } from "react";

function MusicPlayer({
  currentTrack,
  playlist,
  currentTrackIndex,
  onNext,
  onPrev,
  isPlaying,
  setIsPlaying,
  playAll,
}) {
  const [spotifyError, setSpotifyError] = useState(false);

  console.log("🎵 MusicPlayer rendered");
  console.log("🎵 currentTrack:", currentTrack);
  console.log("🎵 currentTrackIndex:", currentTrackIndex);
  console.log("🎵 playlist length:", playlist.length);

  if (!currentTrack) {
    return (
      <div
        className="player-container"
        style={{ textAlign: "center", padding: "40px" }}
      >
        <p>No track selected. Generate a playlist or click Play on a track.</p>
        {playlist.length > 0 && (
          <button className="btn btn-play-all" onClick={playAll}>
            ▶ Play All
          </button>
        )}
      </div>
    );
  }

  if (!currentTrack.track) {
    console.error("❌ currentTrack has no track property:", currentTrack);
    return <div>Error: Invalid track data</div>;
  }

  const { track, youtube } = currentTrack;

  // Get the Spotify track ID (clean it)
  const getSpotifyTrackId = (id) => {
    if (!id) return null;
    // If it's a Spotify URI, extract the ID
    if (id.startsWith("spotify:track:")) {
      return id.split(":")[2];
    }
    // If it's a clean ID (22 chars, alphanumeric with possible underscores/hyphens)
    if (/^[a-zA-Z0-9_-]{22}$/.test(id)) {
      return id;
    }
    // If it's a Last.fm ID or other, try to extract
    if (id.includes("|")) {
      // Last.fm format: lastfm:Title|Artist - try to find in sample data
      return null;
    }
    return null;
  };

  const spotifyTrackId = getSpotifyTrackId(track.id);

  console.log(`🎵 Track: ${track.title} by ${track.artist}`);
  console.log(`🎵 Track ID: ${track.id}`);
  console.log(`🎵 Spotify Track ID: ${spotifyTrackId}`);

  // Build Spotify embed URL - use the clean ID
  const spotifyEmbedUrl = spotifyTrackId
    ? `https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator&theme=0`
    : null;

  const youtubeSearchUrl =
    youtube?.searchUrl ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + " " + track.artist)}`;

  // Handle Spotify embed error
  const handleSpotifyError = () => {
    console.warn("⚠️ Spotify embed failed for track:", track.title);
    setSpotifyError(true);
  };

  return (
    <div className="player-container">
      <div className="now-playing-info" style={{ marginBottom: "15px" }}>
        <h3 style={{ color: "#c8c8ff" }}>🎵 Now Playing: {track.title}</h3>
        <p style={{ color: "#8888aa" }}>
          {track.artist} • {track.album || "Unknown Album"}
        </p>
        <p style={{ color: "#666688", fontSize: "0.9rem" }}>
          Track {currentTrackIndex + 1} of {playlist.length}
        </p>
        {currentTrack.reason && (
          <div className="explanation-box" style={{ marginTop: "10px" }}>
            <div className="label">Why this track?</div>
            <div className="reason">{currentTrack.reason}</div>
          </div>
        )}
      </div>

      {/* Spotify Embed Player */}
      {spotifyEmbedUrl && !spotifyError ? (
        <div className="spotify-wrapper">
          <iframe
            key={spotifyTrackId} // Force re-render when track changes
            style={{ borderRadius: "12px", width: "100%", height: "152px" }}
            src={spotifyEmbedUrl}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={`Spotify player - ${track.title}`}
            onError={handleSpotifyError}
          />
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "30px",
            background: "#1a1a3a",
            borderRadius: "12px",
          }}
        >
          <p style={{ color: "#ffa726", fontSize: "1rem" }}>
            🎵 Listen on Spotify or search on YouTube
          </p>
          <div
            style={{
              display: "flex",
              gap: "15px",
              justifyContent: "center",
              marginTop: "15px",
              flexWrap: "wrap",
            }}
          >
            {spotifyTrackId && (
              <a
                href={`https://open.spotify.com/track/${spotifyTrackId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                🎵 Open in Spotify
              </a>
            )}
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              🔍 Search on YouTube
            </a>
          </div>
        </div>
      )}

      {/* Player Controls */}
      <div className="player-controls">
        <button className="btn btn-secondary" onClick={onPrev}>
          ⏮ Prev
        </button>
        <span style={{ color: "#666688", fontSize: "0.9rem" }}>
          {currentTrackIndex + 1} / {playlist.length}
        </span>
        <button className="btn btn-secondary" onClick={onNext}>
          Next ⏭
        </button>
        {spotifyTrackId && (
          <a
            href={`https://open.spotify.com/track/${spotifyTrackId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-small"
          >
            🎵 Open in Spotify
          </a>
        )}
      </div>
    </div>
  );
}

export default MusicPlayer;
