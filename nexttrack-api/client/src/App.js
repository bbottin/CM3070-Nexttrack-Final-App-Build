// client/src/App.js

import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

// Components
import TrackInput from "./components/TrackInput";
import TrackCard from "./components/TrackCard";
import Playlist from "./components/Playlist";
import MusicPlayer from "./components/MusicPlayer";
import RecommendationExplanation from "./components/RecommendationExplanation";

const API_URL = "http://localhost:3000/api";

function App() {
  const [seedTracks, setSeedTracks] = useState([]);
  const [preferences, setPreferences] = useState({
    mood: "neutral",
    discovery: 0.5,
    genre: "any",
  });
  const [playlist, setPlaylist] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState("checking");

  // Check API health on load
  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await axios.get(
          `${API_URL.replace("/api", "")}/health`,
        );
        if (response.status === 200) {
          setApiStatus("online");
        }
      } catch (err) {
        setApiStatus("offline");
        setError("API server is not running. Please start the server.");
      }
    };
    checkApi();
  }, []);

  // Generate playlist
  const generatePlaylist = async () => {
    if (seedTracks.length < 1) {
      setError("Please add at least 1 seed track");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}/playlist`, {
        seed_tracks: seedTracks.map((t) => t.id),
        preferences: preferences,
        playlist_length: 10,
      });

      setPlaylist(response.data.playlist || []);

      // Set first track as current
      if (response.data.playlist && response.data.playlist.length > 0) {
        setCurrentTrack(response.data.playlist[0]);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Play a track
  const playTrack = (track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  // Play all (start from first)
  const playAll = () => {
    if (playlist.length > 0) {
      setCurrentTrack(playlist[0]);
      setIsPlaying(true);
    }
  };

  // Get next track in playlist
  const nextTrack = () => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (t) => t.track.id === currentTrack.track.id,
      );
      if (currentIndex < playlist.length - 1) {
        setCurrentTrack(playlist[currentIndex + 1]);
      }
    }
  };

  // Get previous track in playlist
  const prevTrack = () => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (t) => t.track.id === currentTrack.track.id,
      );
      if (currentIndex > 0) {
        setCurrentTrack(playlist[currentIndex - 1]);
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎵 NextTrack</h1>
        <p className="subtitle">
          Stateless, Privacy-First Music Recommendations
        </p>
        <div className={`api-status status-${apiStatus}`}>
          {apiStatus === "online" ? "✅ API Online" : "⛔ API Offline"}
        </div>
      </header>

      <main className="App-main">
        <div className="container">
          <section className="input-section">
            <h2>1. Choose Your Seed Tracks</h2>
            <TrackInput
              seedTracks={seedTracks}
              setSeedTracks={setSeedTracks}
              apiStatus={apiStatus}
            />

            <h2>2. Set Your Preferences</h2>
            <div className="preferences-section">
              <div className="preference-group">
                <label>Mood</label>
                <select
                  value={preferences.mood}
                  onChange={(e) =>
                    setPreferences({ ...preferences, mood: e.target.value })
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="calm">Calm</option>
                  <option value="happy">Happy</option>
                  <option value="sad">Sad</option>
                  <option value="energetic">Energetic</option>
                </select>
              </div>

              <div className="preference-group">
                <label>Discovery: {preferences.discovery}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.discovery}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      discovery: parseFloat(e.target.value),
                    })
                  }
                />
                <span className="hint">0 = Familiar | 1 = Discover</span>
              </div>

              <div className="preference-group">
                <label>Genre Preference</label>
                <select
                  value={preferences.genre}
                  onChange={(e) =>
                    setPreferences({ ...preferences, genre: e.target.value })
                  }
                >
                  <option value="any">Any</option>
                  <option value="rock">Rock</option>
                  <option value="pop">Pop</option>
                  <option value="electronic">Electronic</option>
                  <option value="jazz">Jazz</option>
                  <option value="classical">Classical</option>
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary generate-btn"
              onClick={generatePlaylist}
              disabled={loading || seedTracks.length === 0}
            >
              {loading ? "🎶 Generating..." : "🎵 Generate Playlist"}
            </button>

            {error && <div className="error">{error}</div>}
          </section>

          {playlist.length > 0 && (
            <>
              <section className="player-section">
                <h2>3. Now Playing</h2>
                <MusicPlayer
                  currentTrack={currentTrack}
                  playlist={playlist}
                  onNext={nextTrack}
                  onPrev={prevTrack}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  playAll={playAll}
                />
              </section>

              <section className="playlist-section">
                <h2>4. Your Playlist ({playlist.length} tracks)</h2>
                <Playlist
                  playlist={playlist}
                  currentTrack={currentTrack}
                  onPlayTrack={playTrack}
                  onPlayAll={playAll}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
