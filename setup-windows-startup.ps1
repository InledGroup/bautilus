# Bautilus Server Startup Setup for Windows
# This script creates a shortcut in the Startup folder to run the server in the background.

$AppName = "BautilusServer"
$StartupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$ServerDir = Resolve-Path "server"
$NodePath = (Get-Command node).Source

if (-not $NodePath) {
    Write-Host "Error: Node.js not found. Please install Node.js." -ForegroundColor Red
    exit 1
}

Write-Host "Setting up startup task for Bautilus Server..." -ForegroundColor Cyan
Write-Host "Server directory: $ServerDir"
Write-Host "Node path: $NodePath"

# We use a VBScript wrapper to run the Node server without showing a persistent CMD window
$VbsPath = Join-Path $ServerDir "launcher.vbs"
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "$NodePath $ServerDir\index.js", 0
Set WshShell = Nothing
"@

Set-Content -Path $VbsPath -Value $VbsContent

# Create a shortcut in the Startup folder pointing to the VBS script
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut(Join-Path $StartupFolder "$AppName.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsPath`""
$Shortcut.WorkingDirectory = $ServerDir
$Shortcut.Description = "Bautilus Node.js Server"
$Shortcut.Save()

Write-Host "Success! The Bautilus server will now start automatically in the background when you log in." -ForegroundColor Green
Write-Host "To disable it, delete the shortcut from: $StartupFolder"
