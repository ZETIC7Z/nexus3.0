# ============================================================
# NEXUS Setup Script for Windows PowerShell
# Project installs DIRECTLY at: C:\Users\reah.m.e.camingawan\Music
# ============================================================
# Run: Right-click → "Run with PowerShell"
# Or:  powershell -ExecutionPolicy Bypass -File setup-nexus.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$TargetDir = "c:\Users\Administrator\Desktop\NEXUS-setup_1\nexus"
$PatchDir  = "$PSScriptRoot\patches"
$PStreamRepo = "https://github.com/xp-technologies-dev/p-stream.git"

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  N E X U S   S E T U P" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Installing directly into:" -ForegroundColor Gray
    Write-Host "  $TargetDir" -ForegroundColor White
    Write-Host ""
}

function Check-Command($cmd) { return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null }
function Step($n,$msg)  { Write-Host "[$n/8] $msg" -ForegroundColor Cyan }
function OK($msg)       { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Fail($msg)     { Write-Host "  [FAIL] $msg" -ForegroundColor Red; pause; exit 1 }

Write-Header

# -- Prerequisites -------------------------------------------------------------
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
if (-not (Check-Command "git"))  { Fail "Git not found. Install: https://git-scm.com/download/win" }
if (-not (Check-Command "node")) { Fail "Node.js not found. Install: https://nodejs.org" }
OK "Git:  $(git --version)"
OK "Node: $(node --version)"

$pkgMgr = if (Check-Command "pnpm") { "pnpm" } else { "npm" }
OK "Package manager: $pkgMgr"

# -- STEP 1: Clone into workspace ----------------------------------
Step 1 "Cloning P-Stream into $TargetDir ..."

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir | Out-Null
}

$gitDir = Join-Path $TargetDir ".git"
if (Test-Path $gitDir) {
    Write-Host "  Repo exists - pulling latest..." -ForegroundColor Yellow
    Set-Location $TargetDir
    git pull
} else {
    # Clone into a temp folder then move contents into Music
    $tmp = "$env:TEMP\nexus-clone-tmp"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    git clone --depth=1 -b production $PStreamRepo $tmp
    # Move everything from tmp into Music (including hidden .git)
    Get-ChildItem $tmp -Force | ForEach-Object {
        $dest = Join-Path $TargetDir $_.Name
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Move-Item $_.FullName $dest
    }
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Set-Location $TargetDir
OK "P-Stream source is now at $TargetDir"

# -- STEP 2: index.html --------------------------------------------------------
Step 2 "Applying NEXUS index.html..."
Copy-Item "$PatchDir\index.html" "$TargetDir\index.html" -Force
OK "index.html -> NEXUS branded"

# -- STEP 3: manifest.json -----------------------------------------------------
Step 3 "Updating manifest.json..."
Copy-Item "$PatchDir\manifest.json" "$TargetDir\manifest.json" -Force
OK "manifest.json -> NEXUS PWA"

# -- STEP 4: Logo & icons -----------------------------------------------------
Step 4 "Installing NEXUS logo, removing P-Stream icons..."

$pub = "$TargetDir\public"
Copy-Item "$PatchDir\pwa-logo.svg" "$pub\pwa-logo.svg" -Force

$remove = @(
    "android-chrome-192x192.png","android-chrome-512x512.png",
    "apple-touch-icon.png","favicon-16x16.png","favicon-32x32.png",
    "favicon.ico","embed-preview.png","mstile-150x150.png","browserconfig.xml"
)
foreach ($f in $remove) {
    $p = Join-Path $pub $f
    if (Test-Path $p) { Remove-Item $p -Force }
}
Copy-Item "$pub\pwa-logo.svg" "$pub\favicon.ico" -Force
OK "NEXUS logo set as favicon; P-Stream icons removed"

# -- STEP 5: Global brand replacement -----------------------------------------
Step 5 "Replacing all P-Stream / Z-Stream text with NEXUS..."
Set-Location $TargetDir
node "$PatchDir\rebrand.mjs"
OK "All brand text replaced"

# -- STEP 6: Custom providers --------------------------------------------------
Step 6 "Installing 6 NEXUS providers (enc-dec.app + HuggingFace)..."
$provDest = "$TargetDir\src\providers"
if (-not (Test-Path $provDest)) { New-Item -ItemType Directory -Path $provDest | Out-Null }
Copy-Item "$PatchDir\providers\*.ts" $provDest -Force
OK "Providers: TMdb, VidLink, Videasy, VidFast, Hexa, yFlix"

# -- STEP 7: Notification system -----------------------------------------------
Step 6 "Installing audio-dub player files..."
$playerUtils = "$TargetDir\src\utils\player"
$settingsDir = "$TargetDir\src\components\player\atoms\settings"
if (-not (Test-Path $playerUtils)) { New-Item -ItemType Directory -Path $playerUtils -Force | Out-Null }
if (-not (Test-Path $settingsDir)) { New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null }
Copy-Item "$PatchDir\player\audioTracks.ts"         "$playerUtils\audioTracks.ts" -Force
Copy-Item "$PatchDir\player\AudioTrackSelector.tsx" "$settingsDir\AudioTrackSelector.tsx" -Force
OK "Audio dub selector installed (Original default + language switching)"

Step 6 "Copying .env and AI-agent documentation..."
if (-not (Test-Path "$TargetDir\.env")) { Copy-Item "$PatchDir\.env" "$TargetDir\.env" -Force }
$docsDir = "$TargetDir\docs"
if (-not (Test-Path $docsDir)) { New-Item -ItemType Directory -Path $docsDir -Force | Out-Null }
Copy-Item "$PatchDir\docs\*.md" $docsDir -Force
# Place agent files at repo root where tools auto-detect them:
Copy-Item "$PatchDir\docs\PROJECT_CONTEXT.md" "$TargetDir\PROJECT_CONTEXT.md" -Force
Copy-Item "$PatchDir\docs\AGENTS.md"          "$TargetDir\AGENTS.md" -Force
Copy-Item "$PatchDir\docs\CLAUDE.md"          "$TargetDir\CLAUDE.md" -Force
Copy-Item "$PatchDir\docs\.cursorrules"       "$TargetDir\.cursorrules" -Force
OK ".env + docs copied; AGENTS.md/CLAUDE.md/.cursorrules at root for AI agents"

Step 7 "Installing NEXUS notification system..."
$utils = "$TargetDir\src\utils"; $hooks = "$TargetDir\src\hooks"
if (-not (Test-Path $utils)) { New-Item -ItemType Directory -Path $utils | Out-Null }
if (-not (Test-Path $hooks)) { New-Item -ItemType Directory -Path $hooks | Out-Null }
Copy-Item "$PatchDir\notifications.ts"    "$utils\notifications.ts"    -Force
Copy-Item "$PatchDir\useNotifications.ts" "$hooks\useNotifications.ts" -Force
OK "Notification system installed"

# -- STEP 8: Install deps & launch ---------------------------------------------
Step 8 "Installing packages and launching NEXUS..."
Set-Location $TargetDir

if ($pkgMgr -eq "pnpm") { pnpm install } else { npm install --legacy-peer-deps }

Write-Host ""
Write-Host "  ******************************************" -ForegroundColor Green
Write-Host "      NEXUS is ready!" -ForegroundColor Green
Write-Host "      Open http://localhost:5173" -ForegroundColor Green
Write-Host "      Project: $TargetDir" -ForegroundColor Green
Write-Host "  ******************************************" -ForegroundColor Green
Write-Host ""

# if ($pkgMgr -eq "pnpm") { pnpm run dev } else { npm run dev }
Write-Host "  Skipping automatic launch to allow integration steps first."
