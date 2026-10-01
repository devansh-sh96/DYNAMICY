@echo off
cd /d "d:\imp stuff\YEEZUS\dreaming of the past1"
del .tmp-b2.txt 2>nul
call npm run build > .tmp-b2-build.txt 2>&1
echo BUILD_EXIT=%errorlevel% >> .tmp-b2.txt
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del .tmp-app.out.log 2>nul
del .tmp-app.err.log 2>nul
start "" "node_modules\electron\dist\electron.exe" .
REM The model takes 40-90s to come in on this machine; the state line lands in the log.
timeout /t 150 /nobreak >nul
echo RAN_DONE >> .tmp-b2.txt
