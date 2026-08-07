// client/src/components/MusicPlayer.js

import React, { useState, useRef } from "react";
import YouTube from "react-youtube";

function MusicPlayer({
  currentTrack,
  playlist,
  onNext,
  onPrev,
  isPlaying,
  setIsPlaying,
  playAll,
}) {
  const [player, setPlayer] = useState(null);

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

  const { track, youtube } = currentTrack;

  // If no YouTube video found, create a search URL
  if (!youtube || !youtube.videoId) {
    const searchQuery = `${track.title} ${track.artist} official audio`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

    return (
      <div
        className="player-container"
        style={{ textAlign: "center", padding: "40px" }}
      >
        <h3>{track.title}</h3>
        <p style={{ color: "#8888aa" }}>{track.artist}</p>
        <p style={{ color: "#ffa726", fontSize: "0.9rem", marginTop: "10px" }}>
          ⚠️ No direct video found. Click below to search YouTube.
        </p>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ marginTop: "15px" }}
        >
          🔍 Search on YouTube
        </a>
        <div className="player-controls" style={{ marginTop: "20px" }}>
          <button className="btn btn-secondary" onClick={onPrev}>
            ⏮ Prev
          </button>
          <button className="btn btn-secondary" onClick={onNext}>
            Next ⏭
          </button>
        </div>
      </div>
    );
  }

  const opts = {
    height: "390",
    width: "100%",
    playerVars: {
      autoplay: isPlaying ? 1 : 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,
    },
  };

  const onReady = (event) => {
    setPlayer(event.target);
    if (isPlaying) {
      event.target.playVideo();
    }
  };

  const onStateChange = (event) => {
    // 2 = paused, 1 = playing, 0 = ended
    if (event.data === 1) {
      setIsPlaying(true);
    } else if (event.data === 2) {
      setIsPlaying(false);
    } else if (event.data === 0) {
      // Song ended - auto play next
      onNext();
    }
  };

  const togglePlay = () => {
    if (player) {
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="player-container">
      <div className="now-playing-info" style={{ marginBottom: "15px" }}>
        <h3 style={{ color: "#c8c8ff" }}>Now Playing: {track.title}</h3>
        <p style={{ color: "#8888aa" }}>
          {track.artist} • {track.album}
        </p>
        {currentTrack.reason && (
          <div className="explanation-box" style={{ marginTop: "10px" }}>
            <div className="label">Why this track?</div>
            <div className="reason">{currentTrack.reason}</div>
          </div>
        )}
      </div>

      <div className="youtube-wrapper">
        <YouTube
          videoId={youtube.videoId}
          opts={opts}
          onReady={onReady}
          onStateChange={onStateChange}
        />
      </div>

      <div className="player-controls">
        <button className="btn btn-secondary" onClick={onPrev}>
          ⏮ Prev
        </button>
        <button className="btn btn-primary" onClick={togglePlay}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className="btn btn-secondary" onClick={onNext}>
          Next ⏭
        </button>
        {playlist.length > 1 && (
          <span style={{ color: "#666688", fontSize: "0.9rem" }}>
            {playlist.findIndex((t) => t.track.id === currentTrack.track.id) +
              1}{" "}
            / {playlist.length}
          </span>
        )}
      </div>
    </div>
  );
}

export default MusicPlayer;
