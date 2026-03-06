# Standalone Offline Build (Windows)

This project can be packaged as a fully offline Windows app (`.exe`) using PyInstaller.

## What this build does

- Builds the React frontend (`man-diagram-tool/dist`).
- Bundles backend + frontend into one local executable app.
- Bundles the `examples` folder (including the default example JSON).
- Starts a local Flask server on `127.0.0.1` and opens the browser automatically.

## Build

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_standalone.ps1
```

Optional flags:

- `-SkipNpmInstall`: skip `npm ci`
- `-SkipPythonInstall`: skip `pip install` steps

## Output

After build:

- Executable: `dist\MVMApp\MVMApp.exe`
- Distribute the full folder `dist\MVMApp` (not only the exe).

## User experience

End users only need to run:

- `MVMApp.exe`

No internet is required and no local Python/Node installation is needed on target machines.
