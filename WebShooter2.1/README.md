# WebShooter 2.1 - Minimal Edition

A stripped-down version of WebShooter that preserves the high-performance movement architecture of WebShooter-main while removing all extra features.

## Features

- ✅ Smooth, responsive movement (event-driven updates, no rate limiting)
- ✅ Multiple players networked together
- ✅ Shooting mechanics
- ✅ Minimal UI (crosshair + basic HUD)
- ❌ No bots
- ❌ No complex maps
- ❌ No debug UI
- ❌ No leaderboards
- ❌ No death screens
- ❌ No config files

## Installation

```bash
cd WebShooter2.1/server
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## How to Play

- **WASD**: Move around
- **Mouse**: Look around (click to lock pointer)
- **Click/Hold**: Shoot

## Architecture

This version uses the same proven network architecture as WebShooter-main:

1. **Event-driven movement updates**: Sends position/rotation updates immediately when they change, not on a timer
2. **Tight reconciliation**: 0.02 unit threshold with alpha-blended correction
3. **Smooth rotation**: Rotation is alpha-blended (0.35 factor), not snapped
4. **Efficient state broadcasting**: 30 Hz server broadcast, but with immediate client updates

This keeps the feel responsive while staying network-efficient.
