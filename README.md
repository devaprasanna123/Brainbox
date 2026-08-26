# Brain Box AI

## Overview
Brain Box AI is an application that integrates artificial intelligence with Google services (Gmail, Calendar) to provide an intelligent assistant experience. It allows you to manage emails, schedule events, and interact with your digital workspace efficiently.

## Features
- AI-powered assistance
- Gmail Integration (Read, Search, and Send emails)
- Google Calendar Integration (View and create events)
- OAuth 2.0 Authentication

## Architecture
The application consists of a modern frontend (React/Next.js) and a backend service (Node.js/Express) that communicates with Google APIs and AI models. 

## Tech Stack
- Frontend: Next.js, React, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Integrations: Google OAuth 2.0, Gmail API, Google Calendar API
- AI: OpenAI / Gemini / other AI providers (as configured)

## Local Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/devaprasanna123/Brainbox.git
   cd Brainbox
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Environment Variables Required
Create a `.env` file in the root directory (do not commit it). Required variables:
- `GOOGLE_CLIENT_ID`: OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: OAuth Client Secret
- `NEXT_PUBLIC_API_URL`: Backend API URL (default: http://localhost:3000)
- `DATABASE_URL`: Database connection string
- `SESSION_SECRET`: Secret for securing sessions

## Google Setup
1. **Google OAuth setup**: Create a project in Google Cloud Console. Enable Gmail and Calendar APIs. Create OAuth 2.0 Client IDs.
2. **Gmail & Calendar setup**: Ensure the correct scopes are added (`https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/calendar`).
3. Set the Redirect URI to `http://localhost:3000/api/auth/callback/google` (or your appropriate endpoint).

## How to Run
- Frontend: `npm run dev`
- Backend: (Check specific workspace commands, typically `npm run dev` or `npm start` in the apps directory)

## Development Commands
- `npm run dev`: Start development servers
- `npm run build`: Build for production
- `npm run lint`: Run linter

## Troubleshooting
- **OAuth failures**: Ensure the redirect URI in Google Cloud Console matches exactly. Check that the `.env` file contains the correct Client ID and Secret.
- **API Errors**: Check if the tokens have expired. Re-authenticate if necessary.

## Security Notes
- NEVER commit `.env` or any JSON files containing service account credentials.
- Ensure all secrets are added to `.gitignore`.
