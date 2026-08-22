// client/src/components/Playlist.js

import React from "react";

function Playlist({ playlist, currentTrackIndex, onPlayTrack, onPlayAll }) {
  console.log("🎵 Playlist rendered with", playlist.length, "tracks");
  console.log("🎵 Current track index:", currentTrackIndex);
  console.log("🎵 Current track:", playlist[currentTrackIndex]);

  return (
    <div className="playlist-container">
      <div className="playlist-header">
        <span>{playlist.length} tracks</span>
        <button className="btn btn-play-all btn-small" onClick={onPlayAll}>
          ▶ Play All
        </button>
      </div>
      <div className="playlist-grid">
        {playlist.map((item, index) => {
          const isActive = currentTrackIndex === index;
          console.log(
            `🎵 Track ${index}: ${item.track.title} - ${isActive ? "ACTIVE" : ""}`,
          );

          return (
            <div
              key={`${item.track.id || index}-${index}`}
              className={`track-card ${isActive ? "active" : ""}`}
              onClick={() => {
                console.log(`👆 Clicked track ${index}: ${item.track.title}`);
                onPlayTrack(index);
              }}
            >
              <div className="track-title">{item.track.title}</div>
              <div className="track-artist">{item.track.artist}</div>
              <div className="track-meta">
                <span>{item.track.genre || "Unknown"}</span>
                <span>{item.track.year || "N/A"}</span>
                {item.score && (
                  <span className="score-badge">
                    Match: {(item.score * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {item.reason && (
                <div className="explanation-box">
                  <div className="label">Why this track?</div>
                  <div className="reason">{item.reason}</div>
                </div>
              )}
              <div className="track-actions">
                <button
                  className={`btn ${isActive ? "btn-success" : "btn-primary"} btn-small`}
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log(`▶️ Play button clicked for track ${index}`);
                    onPlayTrack(index);
                  }}
                >
                  {isActive ? "▶ Playing" : "▶ Play"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Playlist;
