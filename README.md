# Dynamicy

Dynamicy is an Electron desktop companion with an always-available Dynamic Island, an AI chat panel, focus tools, media controls, system information, and desktop utilities.

## Requirements

- Windows 10 or later
- Node.js 20 or later
- npm

## Install

Clone the repository and install its dependencies:

```bash
git clone https://github.com/devansh-sh96/dynamicy.git
cd dynamicy
npm install
```

If the native SQLite dependency needs rebuilding on your machine, run:

```bash
npm run rebuild
```

## Run In Development

Start the Electron app with hot reload:

```bash
npm run dev
```

## Build

Create a production build:

```bash
npm run build
```

The compiled files are written to `out/`.

## Gemini AI Setup

The AI chat requires a Gemini API key. You can either add it to a local `.env` file or save it from the app's Settings panel.

To use `.env`, copy `.env.example` to `.env` and replace the placeholder:

```env
GEMINI_API_KEY=your_key_here
```

Do not commit `.env` or share your API key.

## Basic Controls

- Double-click the mascot to open the main panel.
- Double-click the mascot in the panel to return to the compact island.
- Click the mascot while media is playing to open the media controls.
- Click the center display to cycle between the equalizer, system gauges, focus, and media views.
- Hold the mascot to tuck the island away; move back over the top restore area to reveal it.
- Use the Settings button in the panel heading to configure the AI key.

## Panel Tools

The panel includes Chat, Diagnostics, Processes, Analytics, Search, Focus, Calendar, Clipboard, Calculator, and Stopwatch tabs. Media controls and quick settings are available when their related system data is available.

## Project Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development app |
| `npm run build` | Build the main, preload, and renderer bundles |
| `npm run rebuild` | Rebuild the native SQLite dependency |
| `npm run preview` | Preview the Electron Vite build |

## License

This project is released under the MIT license.