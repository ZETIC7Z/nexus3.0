@echo off
title NEXUS Setup
color 0C
cls

echo.
echo  ################################################
echo  ##                                            ##
echo  ##   N  E  X  U  S   -   Setup Script        ##
echo  ##                                            ##
echo  ##   Project root:                            ##
echo  ##   c:\Users\Administrator\Desktop\NEXUS-setup_1\nexus ##
echo  ##                                            ##
echo  ################################################
echo.

:: Project installs DIRECTLY into Music folder (not a subfolder)
set TARGET=c:\Users\Administrator\Desktop\NEXUS-setup_1\nexus
set PSTREAM=https://github.com/xp-technologies-dev/p-stream.git
set PATCHES=%~dp0patches

:: ── Prerequisites ───────────────────────────────────────────
echo Checking prerequisites...
where git  >nul 2>&1 || (echo  X Git not found. Install: https://git-scm.com/download/win & pause & exit /b 1)
where node >nul 2>&1 || (echo  X Node.js not found. Install: https://nodejs.org & pause & exit /b 1)
echo  OK - Git and Node.js found
echo.

:: ── Step 1: Clone p-stream INTO Music folder ────────────────
echo [1/8] Cloning P-Stream into %TARGET% ...

if exist "%TARGET%\.git" (
    echo  Repo already exists - pulling latest changes...
    cd /d "%TARGET%"
    git pull
) else (
    :: Clone into temp, move files into Music
    set TMPDIR=%TEMP%\nexus-tmp-%RANDOM%
    git clone --depth=1 -b production %PSTREAM% "%TMPDIR%"
    if errorlevel 1 (echo  X Clone failed & pause & exit /b 1)
    :: Move all files including hidden .git into Music
    xcopy /E /H /Y "%TMPDIR%\*" "%TARGET%\" >nul
    xcopy /E /H /Y "%TMPDIR%\.git\*" "%TARGET%\.git\" >nul 2>&1
    rd /s /q "%TMPDIR%" 2>nul
    cd /d "%TARGET%"
)
echo  OK - P-Stream source at %TARGET%
echo.

:: ── Step 2: Apply NEXUS index.html ─────────────────────────
echo [2/8] Applying NEXUS index.html...
copy /y "%PATCHES%\index.html" "%TARGET%\index.html" >nul
echo  OK - NEXUS title, favicon, OG tags applied
echo.

:: ── Step 3: manifest.json ──────────────────────────────────
echo [3/8] Updating manifest.json...
copy /y "%PATCHES%\manifest.json" "%TARGET%\manifest.json" >nul
echo  OK - PWA name set to NEXUS
echo.

:: ── Step 4: Logo & remove old icons ───────────────────────
echo [4/8] Installing NEXUS logo, removing P-Stream icons...
if not exist "%TARGET%\public" mkdir "%TARGET%\public"
copy /y "%PATCHES%\pwa-logo.svg" "%TARGET%\public\pwa-logo.svg" >nul
copy /y "%PATCHES%\pwa-logo.svg" "%TARGET%\public\favicon.ico"  >nul
del /f /q "%TARGET%\public\android-chrome-*.png" 2>nul
del /f /q "%TARGET%\public\apple-touch-icon.png" 2>nul
del /f /q "%TARGET%\public\favicon-16x16.png"    2>nul
del /f /q "%TARGET%\public\favicon-32x32.png"    2>nul
del /f /q "%TARGET%\public\embed-preview.png"    2>nul
del /f /q "%TARGET%\public\mstile-*.png"         2>nul
del /f /q "%TARGET%\public\browserconfig.xml"    2>nul
echo  OK - NEXUS logo installed, old icons removed
echo.

:: ── Step 5: Global brand text replacement ─────────────────
echo [5/8] Replacing all P-Stream / Z-Stream text with NEXUS...
cd /d "%TARGET%"
node "%PATCHES%\rebrand.mjs"
echo  OK - Brand replacement complete
echo.

:: ── Step 6: Copy providers ─────────────────────────────────
echo [6/8] Installing NEXUS custom providers...
if not exist "%TARGET%\src\providers" mkdir "%TARGET%\src\providers"
copy /y "%PATCHES%\providers\*.ts" "%TARGET%\src\providers\" >nul
echo  OK - TMdb, VidLink, Videasy, VidFast, Hexa, yFlix installed
echo.

:: ── Step 7: Notification system ───────────────────────────
echo [6b/8] Installing audio-dub player files...
if not exist "%TARGET%\src\utils\player" mkdir "%TARGET%\src\utils\player"
if not exist "%TARGET%\src\components\player\atoms\settings" mkdir "%TARGET%\src\components\player\atoms\settings"
copy /y "%PATCHES%\player\audioTracks.ts"          "%TARGET%\src\utils\player\audioTracks.ts" >nul
copy /y "%PATCHES%\player\AudioTrackSelector.tsx"  "%TARGET%\src\components\player\atoms\settings\AudioTrackSelector.tsx" >nul
echo  OK - Audio dub selector installed
echo.

echo [6c/8] Copying .env and documentation...
if not exist "%TARGET%\.env" copy /y "%PATCHES%\.env" "%TARGET%\.env" >nul
if not exist "%TARGET%\docs" mkdir "%TARGET%\docs"
copy /y "%PATCHES%\docs\*.md" "%TARGET%\docs\" >nul
copy /y "%PATCHES%\docs\PROJECT_CONTEXT.md" "%TARGET%\PROJECT_CONTEXT.md" >nul
copy /y "%PATCHES%\docs\AGENTS.md"          "%TARGET%\AGENTS.md" >nul
copy /y "%PATCHES%\docs\CLAUDE.md"          "%TARGET%\CLAUDE.md" >nul
copy /y "%PATCHES%\docs\.cursorrules"       "%TARGET%\.cursorrules" >nul
echo  OK - .env + docs copied (AGENTS.md, CLAUDE.md, .cursorrules at root for AI agents)
echo.

echo [7/8] Installing notification system...
if not exist "%TARGET%\src\utils" mkdir "%TARGET%\src\utils"
if not exist "%TARGET%\src\hooks" mkdir "%TARGET%\src\hooks"
copy /y "%PATCHES%\notifications.ts"    "%TARGET%\src\utils\notifications.ts" >nul
copy /y "%PATCHES%\useNotifications.ts" "%TARGET%\src\hooks\useNotifications.ts" >nul
echo  OK - Notification system ready
echo.

:: ── Step 8: Install packages and launch ───────────────────
echo [8/8] Installing packages...
cd /d "%TARGET%"

where pnpm >nul 2>&1
if %errorlevel% == 0 (
    pnpm install
) else (
    npm install --legacy-peer-deps
)

echo.
echo  ================================================
echo   NEXUS is ready!
echo   Open your browser: http://localhost:5173
echo   Project folder: %TARGET%
echo  ================================================
echo.

where pnpm >nul 2>&1
if %errorlevel% == 0 ( pnpm run dev ) else ( npm run dev )

pause
