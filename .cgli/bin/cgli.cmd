@echo off
if exist "%~dp0\cgli.exe" (
  "%~dp0\cgli.exe" %*
) else if exist "%~dp0\..\..\target\release\cgli.exe" (
  "%~dp0\..\..\target\release\cgli.exe" %*
) else if exist "%~dp0\..\..\target\debug\cgli.exe" (
  "%~dp0\..\..\target\debug\cgli.exe" %*
) else (
  cargo run --quiet --manifest-path "%~dp0\..\..\Cargo.toml" --bin cgli -- %*
)
