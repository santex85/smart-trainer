# Smart Trainer Frontend

Expo (React Native) app: dashboard, meal camera, AI coach chat.

## Setup

1. Install dependencies: `npm install`
2. Set backend URL: create `.env` with `EXPO_PUBLIC_API_URL=http://YOUR_BACKEND_URL` (e.g. `http://10.0.2.2:8000` for Android emulator, `http://localhost:8000` for iOS simulator)
3. Add `assets/icon.png` and `assets/splash.png`, `assets/adaptive-icon.png` (or adjust `app.json` to remove references if missing)
4. Start: `npx expo start`

## Screens

- **Dashboard**: Today summary (nutrition goals, recovery status, next workout), FAB to open camera, link to chat
- **Camera**: Take photo or pick from gallery → upload to `POST /api/v1/nutrition/analyze`, show result
- **Chat**: History, send message, "Get today's decision" runs orchestrator (Go/Modify/Skip)

## API

Uses backend at `EXPO_PUBLIC_API_URL`: nutrition analyze, intervals wellness/events, chat history/send, orchestrator run.
