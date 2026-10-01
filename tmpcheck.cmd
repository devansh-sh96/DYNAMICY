@echo off
cd /d "d:\imp stuff\YEEZUS\dreaming of the past1"
if exist .tmp-tsc.txt del .tmp-tsc.txt
call npx tsc --noEmit -p tsconfig.web.json > .tmp-tsc-web.txt 2>&1
echo WEB_EXIT=%errorlevel% > .tmp-tsc.txt
call npx tsc --noEmit -p tsconfig.node.json > .tmp-tsc-node.txt 2>&1
echo NODE_EXIT=%errorlevel% >> .tmp-tsc.txt
call npm run build > .tmp-build3.txt 2>&1
echo BUILD_EXIT=%errorlevel% >> .tmp-tsc.txt
echo ALLDONE >> .tmp-tsc.txt
