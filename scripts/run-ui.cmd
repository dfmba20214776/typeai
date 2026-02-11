@echo off
setlocal
set "NODE_DIR=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.13.0-win-x64"
if not exist "%NODE_DIR%\pnpm.cmd" (
  echo [ERROR] pnpm.cmd not found: %NODE_DIR%\pnpm.cmd
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0.."
call "%NODE_DIR%\node.exe" scripts\sync_corpus_to_testui.mjs
call "%NODE_DIR%\pnpm.cmd" --filter testui-web dev
endlocal
