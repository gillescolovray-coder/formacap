@echo off
chcp 65001 >nul
title Reparation et lancement - Logiciel OF
color 0E

echo.
echo  ===================================================
echo    REPARATION ET LANCEMENT - LOGICIEL OF
echo  ===================================================
echo.
echo  Cet outil va :
echo    1. Arreter tous les serveurs en cours
echo    2. Nettoyer le cache (souvent la cause des bugs)
echo    3. Relancer l'application
echo.
echo  ===================================================
echo.

REM Toujours se positionner dans le dossier du script
cd /d "%~dp0"

echo  [1/3] Arret des serveurs en cours...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
  echo        Aucun serveur a arreter - OK
) else (
  echo        Serveurs arretes - OK
)
echo.

echo  [2/3] Nettoyage du cache...
if exist ".next" (
  rmdir /S /Q ".next" 2>nul
  if exist ".next" (
    echo        ECHEC : impossible de supprimer .next
    echo        Fermez VS Code et le navigateur, puis relancez ce fichier.
    pause
    exit /b 1
  )
  echo        Cache nettoye - OK
) else (
  echo        Cache deja propre - OK
)
echo.

echo  [3/3] Lancement du serveur...
echo.
echo  ===================================================
echo    Patientez 10 a 30 secondes...
echo    Une fois "Ready" affiche, ouvrez :
echo.
echo    http://localhost:3000
echo.
echo    Pour arreter : appuyez sur Ctrl+C ou fermez cette fenetre.
echo  ===================================================
echo.

call npm.cmd run dev

echo.
echo  ===================================================
echo    Le serveur s'est arrete.
echo  ===================================================
pause
