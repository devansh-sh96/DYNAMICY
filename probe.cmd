@echo off
cd /d "d:\imp stuff\YEEZUS\dreaming of the past1"
echo PROBE_CMD_RAN > .tmp-probecmd.txt
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del .tmp-probe.log 2>nul
del .tmp-probe.err 2>nul
start "" /b "node_modules\electron\dist\electron.exe" tmp-probe.js ask > .tmp-probe.log 2> .tmp-probe.err
