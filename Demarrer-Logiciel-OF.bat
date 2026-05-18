@echo off
title Logiciel OF - CAP NUMERIQUE
color 0B
chcp 65001 > nul

echo.
echo  ============================================================
echo                  LOGICIEL OF - CAP NUMERIQUE
echo  ============================================================
echo.
echo  Demarrage du serveur en cours...
echo.

REM Se positionner dans le dossier du script (compatible si on bouge le .bat)
cd /d "%~dp0"

if errorlevel 1 (
    echo  [ERREUR] Impossible de se placer dans le dossier de l'application.
    echo.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM Etape 1 : arret de tous les serveurs Node deja en cours
REM (evite l'erreur "Failed to open database / persistence directory"
REM  de Turbopack quand un cache est encore verrouille par un ancien
REM  processus)
REM ------------------------------------------------------------
echo  [1/3] Arret des serveurs precedents...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo        Aucun serveur a arreter - OK
) else (
    echo        Serveurs precedents arretes - OK
)
echo.

REM ------------------------------------------------------------
REM Etape 2 : nettoyage complet du cache .next
REM Toujours fait (rapide) pour eviter les bugs de Turbopack
REM ------------------------------------------------------------
echo  [2/3] Nettoyage du cache...
if exist ".next" (
    rmdir /S /Q ".next" 2>nul
    if exist ".next" (
        echo        ECHEC : impossible de supprimer .next
        echo.
        echo        Cause probable : VSCode ou Chrome verrouille un fichier.
        echo        - Ferme VSCode
        echo        - Ferme tous les onglets http://localhost:3000 dans Chrome
        echo        - Puis relance ce fichier .bat
        echo.
        pause
        exit /b 1
    )
    echo        Cache nettoye - OK
) else (
    echo        Cache deja propre - OK
)
echo.

echo  [3/3] Lancement du serveur Next.js...
echo  ------------------------------------------------------------
echo.
echo  Une fois que vous voyez "Ready", l'application sera accessible :
echo.
echo     http://localhost:3000
echo.
echo  Le navigateur va s'ouvrir automatiquement dans 15 secondes.
echo  Pour ARRETER le serveur : appuyez sur Ctrl+C dans cette fenetre,
echo  ou fermez simplement cette fenetre.
echo.
echo  ============================================================
echo.

REM Ouverture differee du navigateur (laisse le temps a Next.js de demarrer)
start "" cmd /c "timeout /t 15 /nobreak > nul && start http://localhost:3000"

REM IMPORTANT : on utilise npm.cmd (pas npm) car npm seul ne fonctionne
REM pas toujours sur Windows en .bat.
call npm.cmd run dev

echo.
echo  ============================================================
echo    Le serveur s'est arrete.
echo  ============================================================
pause
