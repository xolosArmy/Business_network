#!/bin/bash
echo "🧹 Limpiando dependencias y artefactos antiguos..."
rm -rf node_modules package-lock.json
rm -rf android/.gradle android/build android/app/build
echo "✅ Entorno limpio."
echo "Ejecuta ahora: npm install && npx cap sync android"
