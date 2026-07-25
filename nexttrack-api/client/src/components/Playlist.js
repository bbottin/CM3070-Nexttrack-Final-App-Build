// client/src/components/Playlist.js

import React from "react";
import TrackCard from "./TrackCard";

function Playlist({ playlist, currentTrack, onPlayTrack, onPlayAll }) {
  return (
    <div className="playlist-container">
      <div className="playlist-header">
        <span>{playlist.length} tracks</span>
        <button className="btn btn-play-all btn-small" onClick={onPlayAll}>
          ▶ Play All
        </button>
      </div>
      <div className="playlist-grid">
        {playlist.map((track, index) => (
          <TrackCard
            key={track.track.id + index}
            track={track}
            isActive={currentTrack?.track?.id === track.track.id}
            onPlay={onPlayTrack}
            showScore={true}
          />
        ))}
      </div>
    </div>
  );
}

export default Playlist;
