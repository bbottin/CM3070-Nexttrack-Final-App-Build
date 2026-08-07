// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import routes
const recommendRoute = require("./src/routes/recommend");
const trackRoute = require("./src/routes/track");
const playlistRoute = require("./src/routes/playlist");
const searchRoute = require("./src/routes/search");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files for frontend
app.use(express.static(path.join(__dirname, "public")));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use("/api/recommend", recommendRoute);
app.use("/api/track", trackRoute);
app.use("/api/playlist", playlistRoute);
app.use("/api/search", searchRoute);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API documentation
app.get("/api/docs", (req, res) => {
  res.json({
    service: "NextTrack API",
    version: "1.0.0",
    endpoints: [
      {
        method: "POST",
        path: "/api/recommend",
        description: "Get a next track recommendation with YouTube info",
        request_body: {
          track_ids: ["string array of track IDs (Spotify format)"],
          preferences: {
            mood: "string (calm, happy, sad, energetic)",
            discovery: "number (0.0 to 1.0, higher = more novel)",
            genre: "string (optional genre preference)",
          },
        },
        example: {
          track_ids: [
            "spotify:track:6rqhFgbbKwnb9MLmUQDhG6",
            "spotify:track:7Mts0OfPorF4iwOomvfqn1",
          ],
          preferences: { mood: "energetic", discovery: 0.5 },
        },
      },
      {
        method: "POST",
        path: "/api/playlist",
        description: "Generate a full playlist with YouTube links",
        request_body: {
          seed_tracks: ["string array of track IDs"],
          preferences: {
            mood: "string",
            discovery: "number",
            genre: "string",
          },
          playlist_length: "number (default: 10)",
        },
        example: {
          seed_tracks: [
            "spotify:track:6rqhFgbbKwnb9MLmUQDhG6",
            "spotify:track:7Mts0OfPorF4iwOomvfqn1",
          ],
          preferences: { mood: "energetic", discovery: 0.5 },
          playlist_length: 10,
        },
      },
      {
        method: "GET",
        path: "/api/track/:id",
        description: "Get track details by ID with YouTube info",
      },
      {
        method: "GET",
        path: "/health",
        description: "Health check",
      },
    ],
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 NextTrack API running on http://localhost:${PORT}`);
  console.log(`📚 API docs: http://localhost:${PORT}/api/docs`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`🎵 Frontend: http://localhost:${PORT}`);
});
