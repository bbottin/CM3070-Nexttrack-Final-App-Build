# NextTrack: Stateless Music Recommendation API

A privacy-first, explainable music recommendation API built with Node.js, Express, and React.

## Features

- 🔒 **Stateless**: No user tracking, no data persistence
- 🎵 **Content-Based**: Uses audio features (energy, valence, tempo)
- 💬 **Explainable**: Every recommendation includes a human-readable reason
- 🎛️ **User-Controlled**: Mood, discovery, and genre parameters
- 🎧 **Spotify Playback**: Integrated Spotify embed player
- 🔍 **Multiple Sources**: ReccoBeats + Last.fm + sample data fallback

## Quick Start

```bash
# Install dependencies
npm install
cd client && npm install

# Start backend (port 3000)
npm run dev

# Start frontend (port 3001)
cd client && npm start
```
