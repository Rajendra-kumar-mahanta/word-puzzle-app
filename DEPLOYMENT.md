# Deployment

This project can run locally with JSON files, but uses Firebase Auth and Firestore when Firebase environment variables are present.

## Firebase

1. Create a Firebase project.
2. Enable Authentication with the Email/Password sign-in provider.
3. Enable Cloud Firestore.
4. Create a Firebase service account key.
5. Add these environment variables in Vercel:
   - `PUBLIC_BASE_URL`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

You can use `FIREBASE_SERVICE_ACCOUNT_BASE64` instead of the three service account variables.

## Vercel

Deploy the project root to Vercel. The `public/` folder is served as the frontend, and `api/[...path].js` runs the Express API as a Vercel function.

After the first deploy, set `PUBLIC_BASE_URL` to the production Vercel URL and redeploy so generated QR codes use the production domain.
