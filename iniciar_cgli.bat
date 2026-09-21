@echo off
title CGLI - AI Agent Canvas
cd /d "%~dp0"

echo ===================================================
echo     CGLI - Inicializando Aplicacao Desktop (Tauri)
echo ===================================================
echo.
echo Abrindo janela nativa desktop com terminais ConPTY reais...
echo.

call npm run tauri dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Ocorreu uma falha ao iniciar o Tauri.
    pause
)
