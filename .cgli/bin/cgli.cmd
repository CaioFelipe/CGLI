@echo off
setlocal enabledelayedexpansion

if "%CGLI_BRIDGE_PORT%"=="" (
    set CGLI_BRIDGE_PORT=41732
)

set CMD=%1
shift

if "%CMD%"=="spawn-subagent" goto spawn_subagent
if "%CMD%"=="create-artifact" goto create_artifact
if "%CMD%"=="create-preview" goto create_preview
if "%CMD%"=="create-diff" goto create_diff
if "%CMD%"=="list-folders" goto list_folders
if "%CMD%"=="folders" goto list_folders
if "%CMD%"=="status" goto status

echo CGLI Canvas CLI Helper
echo Usage:
echo   cgli spawn-subagent --type [claude|agy] --task "Task description" [--role planner|executor]
echo   cgli create-artifact --title "Title" --content "Markdown..."
echo   cgli create-preview --title "Title" --html "HTML..."
echo   cgli create-diff --title "Title" --file path/to/file
echo   cgli list-folders
exit /b 1

:spawn_subagent
set TYPE=agy
set ROLE=executor
set TASK=
:parse_spawn
if "%1"=="" goto do_spawn
if "%1"=="--type" (set TYPE=%2& shift & shift & goto parse_spawn)
if "%1"=="--role" (set ROLE=%2& shift & shift & goto parse_spawn)
if "%1"=="--task" (set TASK=%2& shift & shift & goto parse_spawn)
shift
goto parse_spawn
:do_spawn
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/spawn-subagent -H "Content-Type: application/json" -d "{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"child_type\":\"%TYPE%\",\"role\":\"%ROLE%\",\"task\":\"%TASK%\"}"
echo [CGLI] Subagente %TYPE% invocado com sucesso no canvas.
exit /b 0

:create_artifact
set TITLE=Documento de Artefato
set CONTENT=
:parse_art
if "%1"=="" goto do_art
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_art)
if "%1"=="--content" (set CONTENT=%2& shift & shift & goto parse_art)
shift
goto parse_art
:do_art
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-artifact -H "Content-Type: application/json" -d "{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"content\":\"%CONTENT%\"}"
echo [CGLI] Nó de artefato criado no canvas.
exit /b 0

:create_preview
set TITLE=Preview Web
set HTML=
:parse_prev
if "%1"=="" goto do_prev
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_prev)
if "%1"=="--html" (set HTML=%2& shift & shift & goto parse_prev)
shift
goto parse_prev
:do_prev
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-preview -H "Content-Type: application/json" -d "{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"html\":\"%HTML%\"}"
echo [CGLI] Nó de preview web criado no canvas.
exit /b 0

:create_diff
set TITLE=Alterações de Código
set FILENAME=
:parse_diff
if "%1"=="" goto do_diff
if "%1"=="--title" (set TITLE=%2& shift & shift & goto parse_diff)
if "%1"=="--file" (set FILENAME=%2& shift & shift & goto parse_diff)
shift
goto parse_diff
:do_diff
curl.exe -s -X POST http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/create-diff -H "Content-Type: application/json" -d "{\"parent_node_id\":\"%CGLI_NODE_ID%\",\"title\":\"%TITLE%\",\"filename\":\"%FILENAME%\"}"
echo [CGLI] Nó de diff criado no canvas.
exit /b 0

:list_folders
curl.exe -s http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/workspace-info
exit /b 0

:status
curl.exe -s http://127.0.0.1:%CGLI_BRIDGE_PORT%/api/status
exit /b 0
