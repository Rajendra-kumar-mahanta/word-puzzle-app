# Class Puzzle Test

Class Puzzle Test is a mobile-first classroom word-search assessment app. Teachers create puzzle tests, share a QR code or link with students, and view live or closed puzzle leaderboards from an isolated teacher dashboard.

## Features

- Teacher signup, login, and password reset flow
- Firebase Auth support for production
- Firestore support for users, puzzles, and student submissions
- Local JSON fallback for development
- Mobile-first teacher dashboard
- Live and closed puzzle status controls
- QR code and share link for every puzzle
- 10x10 to 15x15 puzzle generation based on word length and density
- Easy, Moderate, and Hard puzzle modes
- Puzzle detail page with words, descriptions, QR code, top 3, and full leaderboard
- Student play page with roll number, name, answer submission, highlights, and top 3 unlock

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Without Firebase environment variables, the app uses local JSON files in `data/`.

## Deploy

The project is ready for Vercel + Firebase:

- `public/` is the frontend.
- `api/[...path].js` exposes the Express API as a Vercel Function.
- `server.js` automatically uses Firestore and Firebase Auth when Firebase env vars are present.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the required Firebase and Vercel environment variables.

## Environment Variables

- `PUBLIC_BASE_URL` - production URL used inside generated QR codes
- `FIREBASE_WEB_API_KEY` - Firebase web API key
- `FIREBASE_PROJECT_ID` - Firebase project id
- `FIREBASE_CLIENT_EMAIL` - Firebase service account client email
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key with `\n` line breaks
- `FIREBASE_SERVICE_ACCOUNT_BASE64` - optional alternative to the three service account variables above
- `PORT` - local server port, default `3000`
- `JWT_SECRET` - local JSON fallback session secret
- `DATA_DIR` - local JSON fallback storage directory

## Project Structure

- `server.js` - Express API, Firebase/Auth integration, puzzle generation, QR creation, leaderboard
- `api/[...path].js` - Vercel serverless API entry
- `public/index.html` - teacher landing page and dashboard
- `public/play.html` - student join and puzzle solving screen
- `public/app.js` - teacher dashboard logic
- `public/play.js` - student puzzle logic
- `public/styles.css` - shared mobile-first theme
- `data/` - local development JSON fallback only
