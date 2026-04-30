# Medical Receipt Tracker

Personal-use receipt tracker for out-of-pocket medical expenses with web + iOS support via Expo.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run app:
   - `npm run dev`
3. Configure environment in `apps/client/.env`:
   - `EXPO_PUBLIC_SUPABASE_URL=...`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`

## Structure

- `apps/client`: Expo app (iOS + web)
- `packages/shared`: shared schemas/types
- `supabase/migrations`: SQL schema and policies
- `supabase/functions`: ingestion and parsing function
