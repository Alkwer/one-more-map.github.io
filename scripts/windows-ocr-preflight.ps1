[CmdletBinding()]
param(
  [string]$IniFile = '',
  [string]$ExpectedOcrLanguage = 'en-*',
  [ValidateSet('matched', 'elevated-game-standard-helper')]
  [string]$PrivilegeCase = 'matched'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IniKeys {
  param(
    [string]$Text,
    [string[]]$Keys
  )

  foreach ($key in $Keys) {
    $escapedKey = [regex]::Escape($key)
    if ($Text -notmatch "(?m)^\s*$escapedKey\s*=\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*$") {
      return $false
    }
  }
  return $true
}

function Get-AutoHotkeyV2 {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'AutoHotkey\v2\AutoHotkey64.exe'),
    (Join-Path $env:ProgramFiles 'AutoHotkey\v2\AutoHotkey32.exe')
  )
  if (${env:ProgramFiles(x86)}) {
    $candidates += Join-Path ${env:ProgramFiles(x86)} 'AutoHotkey\v2\AutoHotkey32.exe'
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    $item = Get-Item -LiteralPath $candidate
    if ($item.VersionInfo.ProductMajorPart -ge 2) {
      return $item
    }
  }
  return $null
}

$blockers = [System.Collections.Generic.List[string]]::new()
$currentVersion = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$build = [int]$currentVersion.CurrentBuild
$windowsFamily = if ($build -ge 22000) {
  'Windows 11'
} elseif ($build -ge 10240) {
  'Windows 10'
} else {
  'Unsupported Windows'
}
if ($windowsFamily -eq 'Unsupported Windows') {
  $blockers.Add('Windows 10 or Windows 11 is required.')
}

$helperElevated = (
  [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$autoHotkey = Get-AutoHotkeyV2
if ($null -eq $autoHotkey) {
  $blockers.Add('AutoHotkey v2 was not found in a standard installation location.')
}

$ocrLanguages = @()
$ocrCapabilityAvailable = $true
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $ocrLanguages = @(
    [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]::AvailableRecognizerLanguages |
      ForEach-Object LanguageTag
  )
} catch {
  $ocrCapabilityAvailable = $false
}
$expectedLanguageAvailable = @($ocrLanguages | Where-Object { $_ -like $ExpectedOcrLanguage }).Count -gt 0
if (-not $ocrCapabilityAvailable -or $ocrLanguages.Count -eq 0) {
  $blockers.Add('No Windows Runtime OCR recognizer is available.')
} elseif (-not $expectedLanguageAvailable) {
  $blockers.Add('No OCR recognizer matches the requested language pattern.')
}

$windowSummary = [ordered]@{
  found = $false
  candidateCount = 0
}
if ($null -ne $autoHotkey) {
  $windowProbe = Join-Path $PSScriptRoot 'windows-ocr-window-probe.ahk'
  $probeOutputPath = Join-Path $env:TEMP "voyage-preflight-$([guid]::NewGuid().ToString('N')).json"
  try {
    $probeProcess = Start-Process -FilePath $autoHotkey.FullName `
      -ArgumentList @('/ErrorStdOut', "`"$windowProbe`"") `
      -RedirectStandardOutput $probeOutputPath `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($probeProcess.ExitCode -ne 0) {
      throw 'AutoHotkey window probe failed.'
    }
    $windowSummary = Get-Content -LiteralPath $probeOutputPath -Raw | ConvertFrom-Json
  } catch {
    $windowSummary = [ordered]@{
      found = $false
      candidateCount = 0
      inspectionFailed = $true
    }
  } finally {
    Remove-Item -LiteralPath $probeOutputPath -Force -ErrorAction SilentlyContinue
  }
}
if (-not $windowSummary.found) {
  $blockers.Add('Exactly one running Path of Exile game window is required.')
}

$privilegeMatchesCase = $false
if ($windowSummary.found -and $null -ne $windowSummary.elevated) {
  $privilegeMatchesCase = if ($PrivilegeCase -eq 'matched') {
    $windowSummary.elevated -eq $helperElevated
  } else {
    $windowSummary.elevated -and -not $helperElevated
  }
  if (-not $privilegeMatchesCase) {
    $blockers.Add('The game/helper privilege levels do not match the requested matrix case.')
  }
}

$iniSummary = [ordered]@{
  supplied = -not [string]::IsNullOrWhiteSpace($IniFile)
  exists = $false
  quickBorder = $false
  exactBorder = $false
  chartGridAndTabs = $false
  reroll = $false
}
if ($iniSummary.supplied) {
  if (-not (Test-Path -LiteralPath $IniFile -PathType Leaf)) {
    $blockers.Add('The supplied calibration file does not exist.')
  } else {
    $iniSummary.exists = $true
    $iniText = Get-Content -LiteralPath $IniFile -Raw
    $iniSummary.quickBorder = Test-IniKeys $iniText @(
      'TopLeftX', 'TopY', 'BottomRightX', 'BottomY'
    )
    $exactKeys = 1..12 | ForEach-Object { "Point${_}X"; "Point${_}Y" }
    $iniSummary.exactBorder = Test-IniKeys $iniText $exactKeys
    $iniSummary.chartGridAndTabs = Test-IniKeys $iniText @(
      'TLx', 'TLy', 'BRx', 'BRy', 'Tab1X', 'Tab1Y', 'Tab2X', 'Tab2Y'
    )
    $iniSummary.reroll = Test-IniKeys $iniText @('RerollX', 'RerollY')
  }
}

$artifactNames = @(
  Get-ChildItem -LiteralPath $env:TEMP -File -ErrorAction SilentlyContinue |
    Where-Object Name -Match '^voyage-(?:border-\d+-\d+--?\d+\.png|ocr-(?:filtered|normalized)-\d+-\d+-[0-9a-f]+\.png|border-ocr-\d+\.txt)$'
)
$legacyBridgeNames = @(
  Get-ChildItem -LiteralPath $env:TEMP -File -ErrorAction SilentlyContinue |
    Where-Object Name -Match '^voyage-border-ocr-\d+\.ps1$'
)
if ($artifactNames.Count -gt 0 -or $legacyBridgeNames.Count -gt 0) {
  $blockers.Add('Run-owned or legacy OCR temporary artifacts must be cleared before validation.')
}

$result = [ordered]@{
  schemaVersion = 1
  status = if ($blockers.Count -eq 0) { 'Ready' } else { 'Blocked' }
  blockers = $blockers
  environment = [ordered]@{
    osFamily = $windowsFamily
    osBuild = "$($currentVersion.CurrentBuild).$($currentVersion.UBR)"
  }
  helperRuntime = [ordered]@{
    autoHotkeyV2Found = $null -ne $autoHotkey
    autoHotkeyVersion = if ($null -ne $autoHotkey) { $autoHotkey.VersionInfo.ProductVersion } else { $null }
    elevated = $helperElevated
  }
  gameWindow = $windowSummary
  ocr = [ordered]@{
    capabilityAvailable = $ocrCapabilityAvailable
    availableLanguageCount = $ocrLanguages.Count
    requestedLanguagePattern = $ExpectedOcrLanguage
    requestedLanguageAvailable = $expectedLanguageAvailable
    selectedLanguage = $null
  }
  privilege = [ordered]@{
    requestedCase = $PrivilegeCase
    matchesCase = $privilegeMatchesCase
  }
  calibration = $iniSummary
  temporaryArtifacts = [ordered]@{
    currentCount = $artifactNames.Count
    legacyBridgeCount = $legacyBridgeNames.Count
  }
  privacy = 'No paths, screenshots, OCR text, clipboard contents, account data, character data, or full language profile are emitted.'
}

$result | ConvertTo-Json -Depth 7
if ($blockers.Count -gt 0) {
  exit 1
}
