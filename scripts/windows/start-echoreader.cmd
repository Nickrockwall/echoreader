@echo off
rem Builds the reader and serves it on http://localhost:3001 (Tailscale serves it over HTTPS).
rem Output goes to %LOCALAPPDATA%\EchoReader\server.log.
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "LOGDIR=%LOCALAPPDATA%\EchoReader"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
cd /d "%~dp0..\.."
echo [%date% %time%] starting >> "%LOGDIR%\server.log"
call npm run build >> "%LOGDIR%\server.log" 2>&1
call npm start -w server >> "%LOGDIR%\server.log" 2>&1
