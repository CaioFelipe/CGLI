@echo off
if not defined CGLI_BRIDGE_PORT set CGLI_BRIDGE_PORT=41732
if exist "%~dp0\cgli.exe" (
  "%~dp0\cgli.exe" %*
) else (
  cargo run --quiet --manifest-path "%~dp0\..\..\Cargo.toml" --bin cgli -- %*
)
