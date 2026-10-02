@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 ou superior para iniciar o Persona.
  pause
  exit /b 1
)
echo.
echo Persona - controle financeiro.
echo Abra http://127.0.0.1:3000 no navegador.
echo Mantenha esta janela aberta enquanto usa o sistema.
echo.
node --env-file-if-exists=.env server.js
pause
