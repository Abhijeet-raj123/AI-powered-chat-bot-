# Simple Chatbot

A basic Next.js application featuring a chatbot interface powered by Google's Gemini API.

## Features

- Simple chat interface with user and bot messages
- Integration with Gemini API for generating responses
- Built with Next.js and TypeScript

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Key

The Gemini API key is hardcoded in `app/api/chat/route.ts`. For production, consider using environment variables for security.

## Build

To build the project:
```bash
npm run build
```

To start the production server:
```bash
npm start
```
