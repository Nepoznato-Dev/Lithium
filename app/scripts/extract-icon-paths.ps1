$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root 'src\Components\Icon.jsx'
$outPath  = Join-Path $root 'src\lib\iconPaths.js'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$lines = [System.IO.File]::ReadAllLines($iconPath)

if ($lines[4] -ne 'const ICONS = {' -or $lines[174] -ne '};') {
  throw "Unexpected Icon.jsx shape: L5='$($lines[4])' L175='$($lines[174])'"
}

# Lines 6..174 (1-based) are the registry entries.
$body = $lines[5..173]

$header = @(
  '/**',
  ' * Icon path data, shared by the Preact <Icon> component and the Solid islands.',
  ' *',
  ' * This module is deliberately framework-free: an island must never import a',
  ' * component from the Preact tree just to draw a glyph. It is also the reason',
  ' * glyphs stay inline SVG inside long lists instead of becoming one decoded',
  ' * raster bitmap per row.',
  ' *',
  ' * Extracted from lucide-react v1.34.0 (ISC License)',
  ' */',
  'export const ICON_PATHS = {'
)
$tail = @('};', '')

[System.IO.File]::WriteAllLines($outPath, ($header + $body + $tail), $utf8NoBom)

# Replace the inline registry in Icon.jsx with an import of the new module.
$replacement = @(
  $lines[0..3],
  "import { ICON_PATHS as ICONS } from '../lib/iconPaths.js';",
  '',
  $lines[175..($lines.Length - 1)]
)
[System.IO.File]::WriteAllLines($iconPath, $replacement, $utf8NoBom)

Write-Output "iconPaths.js entries: $($body.Count)"
Write-Output "Icon.jsx lines: $($lines.Length) -> $($replacement.Length)"
