$sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
$zipPath = "$env:USERPROFILE\cmdline-tools.zip"
$tempExtractDir = "$env:USERPROFILE\android-sdk-temp"

# Ensure SDK directory exists
if (-not (Test-Path $sdkDir)) {
    New-Item -ItemType Directory -Force -Path $sdkDir
}

# 1. Download Command Line Tools
if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading Android SDK Command-line Tools..."
    Start-BitsTransfer -Source "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" -Destination $zipPath
}

# 2. Extract ZIP
if (Test-Path $tempExtractDir) {
    Remove-Item -Recurse -Force $tempExtractDir
}
Write-Host "Extracting Command-line Tools..."
Expand-Archive -Path $zipPath -DestinationPath $tempExtractDir

# 3. Create cmdline-tools structure
$cmdlineToolsDir = "$cmdlineToolsDir" # wait, we can just compute it directly
$cmdlineToolsDir = "$sdkDir\cmdline-tools"
if (Test-Path $cmdlineToolsDir) {
    Remove-Item -Recurse -Force $cmdlineToolsDir
}
New-Item -ItemType Directory -Force -Path "$cmdlineToolsDir\latest"

# 4. Move files from extracted folder to "cmdline-tools/latest"
Write-Host "Setting up directory structure..."
Copy-Item -Path "$tempExtractDir\cmdline-tools\*" -Destination "$cmdlineToolsDir\latest" -Recurse -Force

# Clean up temp files
Remove-Item -Recurse -Force $tempExtractDir
Remove-Item -Force $zipPath

# 5. Run sdkmanager to install platform-tools and accept licenses
Write-Host "Installing platform-tools and accepting licenses..."
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$sdkManager = "$cmdlineToolsDir\latest\bin\sdkmanager.bat"

# Accept all licenses
$yesString = "y`ny`ny`ny`ny`ny`ny`n"
$yesString | & $sdkManager --sdk_root=$sdkDir --licenses

# Install platform-tools
& $sdkManager --sdk_root=$sdkDir "platform-tools"

# Create local.properties file in the android directory
# Since $PSScriptRoot points to the folder containing this script (c:\Users\Riko\Desktop\123\scripts)
# the local.properties path should be c:\Users\Riko\Desktop\123\android\local.properties
$localPropertiesPath = Join-Path -Path $PSScriptRoot -ChildPath "..\android\local.properties"
$sdkPathEscaped = $sdkDir.Replace('\', '\\').Replace(':', '\:')
"sdk.dir=$sdkPathEscaped" | Out-File -FilePath $localPropertiesPath -Encoding ascii -Force
Write-Host "Created local.properties pointing to Android SDK at $sdkDir"

Write-Host "Android SDK Setup Completed Successfully!"
