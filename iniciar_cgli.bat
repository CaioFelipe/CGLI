@echo off
title CGLI - AI Agent Canvas
cd /d "%~dp0"

echo ===================================================
echo     CGLI - Inicializando Aplicacao Desktop (Tauri)
echo ===================================================
echo.
echo Verificando processos anteriores...
taskkill /F /IM app.exe >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo Abrindo janela nativa desktop com terminais ConPTY reais...
echo.

call npm run tauri dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Ocorreu uma falha ao iniciar o Tauri.
    pause
)
