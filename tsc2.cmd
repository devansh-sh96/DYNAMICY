@echo off
cd /d "d:\imp stuff\YEEZUS\dreaming of the past1"
del .tmp-r2.txt 2>nul
call npx tsc --noEmit -p tsconfig.node.json > .tmp-r2-node.txt 2>&1
echo NODE_EXIT=%errorlevel% >> .tmp-r2.txt
call npx tsc --noEmit -p tsconfig.web.json > .tmp-r2-web.txt 2>&1
echo WEB_EXIT=%errorlevel% >> .tmp-r2.txt
echo DONE >> .tmp-r2.txt
