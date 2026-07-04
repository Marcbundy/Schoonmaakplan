# =====================================================
# deploy.ps1 - Schoonmaakplan GTE
# Cache-bust + live deploy naar Firebase Hosting (project schoonmaakplan-gte).
# Gebruik:  .\deploy.ps1
# =====================================================
$ErrorActionPreference = 'Stop'

$root      = $PSScriptRoot
$indexPath = Join-Path $root 'public\index.html'
$appPath   = Join-Path $root 'public\app.js'

# Versie-stempel voor de cache-bust (datum+tijd).
$stamp = (Get-Date).ToString('yyyyMMddHHmmss')

# 1) Validatie van de JS voor we iets publiceren.
Write-Host "node --check public/app.js ..."
& node --check $appPath
if ($LASTEXITCODE -ne 0) { throw "node --check faalde op app.js - deploy afgebroken." }

# 2) Cache-bust: zet/ververs ?v=<stamp> op app.js en styles.css in index.html.
$enc  = New-Object System.Text.UTF8Encoding($false)   # UTF-8 zonder BOM
$html = [System.IO.File]::ReadAllText($indexPath)
$html = [regex]::Replace($html, 'href="styles\.css(\?v=[^"]*)?"', "href=`"styles.css?v=$stamp`"")
$html = [regex]::Replace($html, 'src="app\.js(\?v=[^"]*)?"',     "src=`"app.js?v=$stamp`"")
[System.IO.File]::WriteAllText($indexPath, $html, $enc)
Write-Host "Cache-bust toegepast: v=$stamp"

# 3) Live deploy (alleen hosting).
Write-Host "firebase deploy --only hosting ..."
& firebase deploy --only hosting
if ($LASTEXITCODE -ne 0) { throw "firebase deploy faalde." }

Write-Host ""
Write-Host "Klaar. Live: https://schoonmaakplan-gte.web.app  (cache-bust v=$stamp)"
