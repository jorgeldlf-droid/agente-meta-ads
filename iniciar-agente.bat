@echo off
title Central IA Porcelanato Shop

start "Backend Porcelanato Shop" cmd /k "cd /d C:\agente-meta-ads && node server.js"

timeout /t 3

start "Painel Porcelanato Shop" cmd /k "cd /d C:\agente-meta-ads\painel-porcelanato-shop && npm run dev"

timeout /t 5

start http://localhost:5173

exit