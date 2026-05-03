# 🎫 Ticket Scanner/
A Progressive Web App that uses AI to extract and organise data from receipts and transport tickets, built with vanilla JavaScript and the Gemini Vision API./
→ [Live Demo]([https://sabasad.github.io/ticket-scanner/).
> To use the app, you'll need a [Gemini API key](https://aistudio.google.com/) and a Google Drive Client ID from the [Google Cloud Console](https://console.cloud.google.com/) — paste both in the Settings screen.
/
## What it does/
Point your camera at any shopping receipt or transport ticket, and the app reads it for you. It extracts the date, amount, vendor, and ticket type, lets you confirm or correct the result, and saves everything locally so you can review your history, export it to a spreadsheet, or upload ticket photos to your Google Drive.
No account needed. No data leaves your device except the photo sent to the AI, and if you want to upload it to your Google Drive.

## Features/
📷 Camera capture: Take a photo or upload from your gallery
🤖 AI extraction:	Gemini Vision API reads date, amount, vendor, ticket type
✏️ Review & edit:	Confirm or correct any field before saving
📋 History view:	All past scans in one scrollable list
☁️ Google Drive sync:	Export and back up your scan history to Google Drive
📤 CSV export:	Download your data as a spreadsheet
📵 Offline-capable:	Service worker caches the app shell
📱 Installable:	Appears on your home screen like a native app
/
## Tech stack
Frontend: Vanilla HTML, CSS, JavaScript — no frameworks/
AI: Google Gemini Vision API for image-to-data extraction
Cloud: Google Drive API for backup and export
Auth: Google OAuth 2.0
Storage: IndexedDB (all data stays on your device)
PWA: Web App Manifest + Service Worker
Hosting: GitHub Pages
/
## Why I built this/
My dad needed to upload receipts and tickets for his taxes, but doing it manually one by one was extremely slow. I built this to automate the extraction and organisation so he could just scan a pile of tickets and have the data ready to export, cutting what used to take hours down to minutes.
/
## What I learned/
How Progressive Web Apps differ from regular websites and what makes them installable
Working with the browser's MediaDevices API for camera access
Structuring prompts to get reliable JSON output from a vision model
Google OAuth 2.0 flow and integrating the Google Drive API from a client-side app
IndexedDB for persistent client-side storage without a backend
