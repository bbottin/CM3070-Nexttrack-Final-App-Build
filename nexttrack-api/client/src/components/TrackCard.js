// client/src/components/TrackCard.js

import React from "react";

function TrackCard({
  track,
  isActive,
  onPlay,
  onAddToQueue,
  showScore = false,
}) {
  const { track: trackData, score, reason, youtube } = track;

  return (
    <div className={`track-card ${isActive ? "active" : ""}`}>
      <div className="track-title">{trackData.title}</div>
      <div className="track-artist">{trackData.artist}</div>
      <div className="track-meta">
        <span>{trackData.genre || "Unknown"}</span>
        <span>{trackData.year || "N/A"}</span>
        {showScore && score && (
          <span className="score-badge">
            Match: {(score * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {reason && (
        <div className="explanation-box">
          <div className="label">Why this track?</div>
          <div className="reason">{reason}</div>
        </div>
      )}

      <div className="track-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={() => onPlay(track)}
        >
          ▶ Play
        </button>
        {onAddToQueue && (
          <button
            className="btn btn-secondary btn-small"
            onClick={() => onAddToQueue(track)}
          >
            + Add to Queue
          </button>
        )}
      </div>
    </div>
  );
}

export default TrackCard;
