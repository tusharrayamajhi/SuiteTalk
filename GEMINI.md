# SuiteTalk Project Instructions

## Overview
SuiteTalk is an on-premise AI voice assistant for hotels, integrating internal telephony (Asterisk) with Google Gemini and a PostgreSQL (pgvector) backend.

## Architecture
- **Telephony:** Internal SIP (Asterisk/FreeSWITCH) -> Node.js bridge.
- **AI:** Google Gemini (Voice/Audio Realtime API).
- **Backend:** Node.js + TypeScript.
- **Database:** PostgreSQL + pgvector (Semantic Search).
- **Frontend:** Next.js (Staff Dashboard).

## Conventions
- Use TypeScript for all backend and frontend code.
- Follow "zero-headache" principles: high autonomy, robust error handling for voice streams.
- All service requests must be logged in the database before completion.

## Roadmap
Refer to the [PRD in plans directory](C:\Users\Acer\.gemini\tmp\suitetalk\de3285be-061a-41a6-abdf-0a8e9dfffa18\plans\suitetalk_prd.md) for detailed implementation steps.