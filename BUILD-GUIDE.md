# Naqdi — Build & Publish Guide

## Prerequisites
- Node.js 18+ (download from https://nodejs.org)
- Git (download from https://git-scm.com)
- Windows 10/11 (for building Windows installer)
- GitHub account with Personal Access Token (repo scope)

## First Time Setup

### 1. Initialize Git and push code
```bash
cd your-naqdi-project-folder
git init
git add .
git commit -m "v1.0.0"
git branch -M main
git remote add origin https://github.com/albagshiaa/naqdi.git
git push -u origin main
```

### 2. Install dependencies
```bash
npm install
```

### 3. Test locally (before building)
```bash
npm start
```

## Building the Installer

### Build locally (no upload)
```bash
npm run build:win
```
This creates `dist/Naqdi Setup 1.0.0.exe` — the installer file.

### Build + Publish to GitHub Releases (with auto-update)
```bash
# Windows Command Prompt:
set GH_TOKEN=your_github_token_here
npm run publish

# Windows PowerShell:
$env:GH_TOKEN="your_github_token_here"
npm run publish

# macOS/Linux:
GH_TOKEN=your_github_token_here npm run publish
```
This builds the installer AND uploads it to GitHub Releases automatically.

## Releasing a New Version

### 1. Update version number
Open `package.json` and change the version:
```json
"version": "1.1.0"
```

### 2. Commit and push
```bash
git add .
git commit -m "v1.1.0 - description of changes"
git push
```

### 3. Build and publish
```bash
set GH_TOKEN=your_github_token_here
npm run publish
```

### 4. Done!
All merchants running the app will see "Version 1.1.0 is ready to install" 
with a "Restart Now" button at the bottom of the screen.

## Version Numbering Guide
- `1.0.0` → First release
- `1.0.1` → Bug fix (small change)
- `1.1.0` → New feature added
- `2.0.0` → Major redesign or breaking change

## Distributing to New Merchants

### First install (manual):
1. Go to https://github.com/albagshiaa/naqdi/releases
2. Find the latest release
3. Download the `.exe` file
4. Send it to the merchant (email, WhatsApp, USB drive, etc.)
5. Merchant runs the installer

### All future updates (automatic):
The app handles it — merchant just clicks "Restart Now" when prompted.

## Folder Structure After Build
```
dist/
  Naqdi Setup 1.0.0.exe     ← Installer for merchants
  latest.yml                  ← Auto-update metadata (uploaded to GitHub)
  win-unpacked/               ← Unpacked app (for testing)
```

## Troubleshooting

### "npm run build:win" fails
- Make sure `npm install` completed without errors
- Delete `node_modules` folder and `package-lock.json`, then run `npm install` again

### SmartScreen warning on install
- This is normal without a code signing certificate
- Merchant clicks "More info" → "Run anyway"
- Optional: Buy a code signing certificate ($70-200/year) to remove this warning

### Auto-update not working
- Make sure `GH_TOKEN` was set when publishing
- Check https://github.com/albagshiaa/naqdi/releases — the release should be visible
- The app checks for updates 10 seconds after launch, then every 4 hours

### Merchant's data after update
- All data is safe — database and settings are stored in %APPDATA%/naqdi
- Updates only replace the app files, never touch user data
- Even uninstall preserves data (deleteAppDataOnUninstall is false)
