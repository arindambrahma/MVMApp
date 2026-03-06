param(
    [switch]$SkipNpmInstall,
    [switch]$SkipPythonInstall
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Script
    )
    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $projectRoot "man-diagram-tool"
$requirementsFile = Join-Path $projectRoot "backend\requirements.txt"

Write-Host "==> Project root: $projectRoot"

Write-Host "==> Building frontend"
Push-Location $frontendDir
try {
    if (-not $SkipNpmInstall) {
        Invoke-Checked -Label "npm ci" -Script { npm ci }
    }
    Invoke-Checked -Label "npm run build" -Script { npm run build }
}
finally {
    Pop-Location
}

Write-Host "==> Installing Python dependencies"
Push-Location $projectRoot
try {
    if (-not $SkipPythonInstall) {
        Invoke-Checked -Label "pip upgrade" -Script { python -m pip install --upgrade pip }
        Invoke-Checked -Label "pip requirements install" -Script { python -m pip install -r $requirementsFile }
        Invoke-Checked -Label "pip pyinstaller install" -Script { python -m pip install pyinstaller }
    }

    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }

    Write-Host "==> Packaging with PyInstaller"
    Invoke-Checked -Label "PyInstaller build" -Script {
        python -m PyInstaller `
            --noconfirm `
            --clean `
            --name "MVMApp" `
            --onedir `
            --add-data "man-diagram-tool/dist;man-diagram-tool/dist" `
            --add-data "examples;examples" `
            --add-data "reference-documents;reference-documents" `
            "backend/standalone_main.py"
    }

    Write-Host ""
    Write-Host "Standalone package created:"
    Write-Host "  $projectRoot\dist\MVMApp\MVMApp.exe"
}
finally {
    Pop-Location
}
