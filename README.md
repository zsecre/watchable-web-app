# Watchable - Vercel Deployment Guide

To deploy this app on Vercel and make sure the Movie/TV/Anime data shows up, you need to follow these steps:

## 1. Set up Environment Variables
The app uses a server-side proxy to securely communicate with the TMDB API.
1. Go to your **Vercel Dashboard**.
2. Select your project -> **Settings** -> **Environment Variables**.
3. Add a new variable:
   - **Key**: `TMDB_TOKEN`
   - **Value**: `eyJhbGciOiJIUzI1NiJ9...` (Your full TMDB Read Access Token)
4. Click **Save**.
5. **Redeploy** your app for the changes to take effect.

*Note: The app now automatically handles tokens that might have been pasted with the "Bearer " prefix or extra spaces.*

## 2. Architecture
- **Frontend**: Built with React + Vite. Vercel serves the `/dist` folder.
- **Backend (Proxy)**: Handled by the `api/proxy.ts` serverless function. 
- **Routing**: The `vercel.json` file ensures that API calls go to the function and all other routes go to your React app (allowing internal page refreshes to work).

## 3. Deployment Configuration
Vercel should automatically detect the framework as **Vite**.
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

If you encounter a blank page or no results, check the **Function Logs** in the Vercel Dashboard to see if the proxy is reporting any errors.
