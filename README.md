<div align="center">

# Real-Time Grid Clash Backend

<p><strong>Fast, Redis-powered multiplayer backend for a dots-and-boxes style game with matchmaking, friend requests, and live score tracking.</strong></p>

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/en)
[![Socket.io](https://img.shields.io/badge/WebSockets-Socket.io-blue)](https://socket.io/)
[![Redis](https://img.shields.io/badge/Redis-In--Memory-brightgreen)](https://redis.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

</div>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Environment Variables](#environment-variables)
  - [Run Locally](#run-locally)
  - [Run with Docker](#run-with-docker)
- [HTTP API Reference](#http-api-reference)
- [Real-Time Socket API](#real-time-socket-api)
- [Game Flow](#game-flow)
- [Redis Data Model](#redis-data-model)
- [Development Notes](#development-notes)
- [Contributing](#contributing)
- [Roadmap Ideas](#roadmap-ideas)
- [License](#license)

## Overview

This repository provides the backend for a real-time, turn-based grid game inspired by classic dots-and-boxes. Players can discover each other, exchange friend requests, negotiate grid sizes, and battle for territory. The service exposes a lightweight HTTP API for basic user utilities and leverages Socket.io for high-frequency, low-latency gameplay updates. Redis is used as the primary data store for player presence, match state, and transient social interactions.

## Features

- **Zero-latency gameplay** powered by Socket.io with per-room broadcasts.
- **Presence tracking** so players can see who is online in real time.
- **Friend request workflow** with automatic expiration handling.
- **Match orchestration** including grid size voting, turn management, and scoring.
- **Graceful reconnects** by persisting session-bound room assignments in Redis.
- **Simple HTTP utilities** for availability checks and dashboards.
- **Docker-ready deployment** for consistent production rollouts.

## Architecture

- **Express (HTTP)** handles REST endpoints, JSON parsing, and middleware.
- **Socket.io (WebSockets)** coordinates the interactive gameplay loop.
- **Redis** stores user sessions, online presence rosters, friend requests, game rooms, and serialized game state objects.
- **UUID** supplies unique room identifiers for each head-to-head match.

At runtime the backend starts an `http.Server`, binds Socket.io to it, and reuses Redis for both stateless lookup and small, fast game-state snapshots.

## Project Structure

```
.
├── Dockerfile
├── package.json
├── package-lock.json
├── index.js            # Alternate entry point for container builds
└── src
    ├── app.js          # Express app + Socket.io game logic
    ├── index.js        # Default entry point (loads env, boots Redis + HTTP server)
    ├── controllers
    │   └── user.controller.js
    ├── routes
    │   └── user.route.js
    └── utils
        ├── ApiError.js
        ├── ApiResponse.js
        └── asyncHandler.js
```

> **Heads up:** The Dockerfile copies the top-level `index.js` into `src/index.js` inside the image, so containerized deployments use the production connection settings defined in that file. Local development typically runs from `src/index.js`.

## Tech Stack

- Node.js 20+
- Express 5
- Socket.io 4
- Redis 5+
- UUID 11
- Docker (optional)

## Prerequisites

- **Node.js** v20 or later (matches the `node:20-alpine` base image)
- **npm** v10 or later
- **Redis** server reachable from the backend (local instance or managed service)

## Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/<your-org>/real-time-grid-clash.git
cd real-time-grid-clash
npm install
```

### Environment Variables

Create a `.env` file in the project root and provide the values below:

```bash
PORT=9000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9000` | HTTP and Socket.io port for local development |
| `REDIS_HOST` | `127.0.0.1` | Redis host name or IP address |
| `REDIS_PORT` | `6379` | Redis TCP port |

> When using Docker you can pass overrides via `docker run -e`, or rely on the defaults baked into the image.

### Run Locally

Start Redis (if not already running):

```bash
redis-server
```

Boot the backend:

```bash
node src/index.js
```

Expected logs:

```
Connected to Redis successfully
Server is running on port 9000
```

You can enable file watching with native Node.js tooling:

```bash
node --watch src/index.js
```

### Run with Docker

Build the image:

```bash
docker build -t grid-clash-backend .
```

Run the container, pointing it at your Redis host:

```bash
docker run \
  -e PORT=9000 \
  -e REDIS_HOST=host.docker.internal \
  -e REDIS_PORT=6379 \
  -p 9000:9000 \
  grid-clash-backend
```

## HTTP API Reference

Base URL: `http://localhost:{PORT}` (defaults to `http://localhost:9000`). All responses are JSON.

### `GET /`

Health-check endpoint that returns the string `"hello world"` to confirm the server is alive.

### `GET /api/user/onlineUsers`

Returns the set of users currently online (players who have emitted the `join` Socket event within the last 30 minutes).

- **Response `200`**

```json
[
  {
    "socketId": "vYKk3...",
    "username": "alex",
    "sessionId": "81f2d5eb-..."
  }
]
```

### `POST /api/user/checkUsername`

Checks whether a username is already in use by any active session stored in Redis.

- **Request Body**

```json
{
  "username": "alex"
}
```

- **Response `200`**

```json
{
  "message": "Username is available"
}
```

- **Response `400`** – missing `username` field.
- **Response `404`** – username is already claimed by an active session.

### `POST /api/user/requests`

Fetches pending friend requests (sent and received) tied to the caller’s session.

- **Request Body**

```json
{
  "sessionId": "81f2d5eb-..."
}
```

- **Response `200`**

```json
[
  { "from": "me", "to": "ec92462f-..." },
  { "from": "d9a3f9f0-...", "to": "me" }
]
```

> Requests expire automatically after five minutes thanks to Redis `EX` rules.

## Real-Time Socket API

The backend uses Socket.io. Clients must provide a `sessionId` during the handshake:

```js
const socket = io("http://localhost:9000", {
  auth: { sessionId }
});
```

If the `sessionId` is missing or empty, the connection is rejected.

### Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `join` | `username: string` | Registers the player, refreshes their session TTL (30 minutes), and broadcasts an updated online roster. |
| `sendFriendRequest` | `toSessionId: string` | Queues a friend request for another online player (expires after five minutes). |
| `friendRequestAccepted` | `toSessionId: string` | Creates a room, seeds game state, and notifies both players that the match has begun. |
| `checkActiveRoom` | none | Rejoins the caller to any in-progress match and replays state snapshots. |
| `joinGameRoom` | `roomId: string` | Manually join a room and receive the latest game state. |
| `selectGridSize` | `{ roomId, gridSize, player }` | One-time selection of the board dimension (allowed values: 4, 5, 6, 7, 8). |
| `makeMove` | `{ roomId, from, to, player }` | Draws an edge between adjacent dots. Validates duplicates, updates scores, flips turns, and announces completions. |
| `leaveGame` | none | Leaves the active match, clears matchmaking keys, and notifies the opponent. |
| `leave` | none | Clears presence and request keys for the caller (use on manual logout). |

The `from` and `to` coordinates in `makeMove` are objects of the form `{ row: number, col: number }` and must be adjacent.

### Server → Client Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `onlineUsers` | `Array<PlayerSummary>` | Broadcast whenever the online roster changes. |
| `receiveFriendRequest` | `{ from: sessionId, to: "me" }` | Fired to the targeted player when someone requests a match. |
| `gameStart` | `GameState` | Emitted when a friend request is accepted and a room initializes. |
| `activeRoom` | `roomId` or `null` | Response to `checkActiveRoom` showing current assignment. |
| `playerRoleAssigned` | `"player1"` or `"player2"` | Sent after room join so the client knows its turn order. |
| `gameStateUpdate` | `GameState` | Emitted after `checkActiveRoom` or `joinGameRoom` to sync the latest state. |
| `gridSizeSelected` | `GameState` | Broadcast after the board size is locked in. |
| `connectionMade` | `GameState` | Emitted after a valid move when the game continues. |
| `gameFinished` | `GameState` | Emitted when all squares are claimed, including winner information. |
| `userLeft` | `sessionId` | Broadcast when a player leaves the room mid-match. |
| `error` | `message: string` | Sent when validation fails (invalid move, bad grid size, etc.). |

### Game State Shape

The serialized `GameState` object stored in Redis and emitted via Socket.io looks like:

```json
{
  "roomId": "f0db0c1a-...",
  "connections": [
    {
      "from": { "row": 0, "col": 0 },
      "to": { "row": 0, "col": 1 },
      "player": "player1",
      "timestamp": 1735579200000
    }
  ],
  "completedSquares": [
    {
      "topLeft": { "row": 1, "col": 1 },
      "completedAt": 1735579212345,
      "player": "player2"
    }
  ],
  "currentPlayer": "player2",
  "scores": { "player1": 1, "player2": 2 },
  "gameStatus": "playing",
  "players": {
    "player1": { "id": "81f2d5eb-...", "name": "alex", "connected": true },
    "player2": { "id": "662c4b13-...", "name": "sam", "connected": true }
  },
  "gridSize": 6,
  "gridSelectedBy": "player1",
  "createdAt": 1735579187654,
  "lastMove": 1735579212345
}
```

## Game Flow

- Players connect with a `sessionId` and emit `join` with their display name.
- The lobby UI listens to `onlineUsers` to show available opponents.
- A challenger emits `sendFriendRequest`; the recipient receives `receiveFriendRequest` and answers with `friendRequestAccepted`.
- The server provisions a room, creates and stores the initial `GameState`, and emits `gameStart`.
- One player selects a grid size via `selectGridSize`, switching the match into `playing` mode.
- Players alternate calling `makeMove`; when a square is completed the mover scores and keeps the turn.
- When all squares are claimed the server emits `gameFinished` with the winner; leaving early triggers `userLeft`.

## Redis Data Model

| Key Pattern | Type | TTL | Contents |
|-------------|------|-----|----------|
| `user:<sessionId>` | string | 30 minutes | JSON blob containing `{ socketId, username, sessionId }`. |
| `onlineUser:<sessionId>` | string | 30 minutes | Mirror of the user object used for lobby listings. |
| `friendRequests:sent:<sessionId>` | set | 5 minutes | Serialized objects tracking outgoing friend requests. |
| `friendRequests:received:<sessionId>` | set | 5 minutes | Serialized objects tracking incoming friend requests. |
| `activeUser:<sessionId>` | string | 60 minutes | Room ID for the player’s ongoing match. |
| `gameState:<roomId>` | string | 60 minutes | Serialized `GameState` JSON for the active match. |
| `room:<roomId>` | hash | 60 minutes | Hash fields: `players` (JSON array) and `status`. |

## Development Notes

- `asyncHandler` wraps controllers so uncaught async errors propagate to Express error middleware.
- `ApiError` and `ApiResponse` utilities exist in `src/utils/` and can be adopted for richer HTTP responses.
- The project currently lacks a logging abstraction; consider integrating `pino` or `winston` for production readiness.
- Rate limiting and authentication are intentionally minimal to keep onboarding simple; add guards before going to production.

## Contributing

We welcome contributions of all sizes! To get started:

1. Fork the repository and create a feature branch (`git checkout -b feat/<short-name>`).
2. Make your changes with clear, small commits.
3. Add or update documentation and tests when applicable.
4. Ensure the server boots locally (`node src/index.js`) and that linting (if added) passes.
5. Submit a pull request describing the problem, solution, and any follow-up ideas.

Please follow conventional commit messages where possible (e.g., `feat: add rematch endpoint`).

## Roadmap Ideas

- Add a REST endpoint for retrieving historical match results.
- Implement authentication and persistent user profiles.
- Support spectating and broadcasting finished match summaries.
- Add unit and integration tests (Jest + supertest + socket.io testing library).
- Expose Prometheus-ready metrics for observability.

## License

This project is open-source under the ISC License. See [Open Source Initiative](https://opensource.org/licenses/ISC) for license text, or add a dedicated `LICENSE` file when publishing.

