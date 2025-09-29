#!/bin/bash
echo "🧹 Limpiando rastros de React Native..."
npm uninstall react-native-gradle-plugin --save-dev
rm -rf node_modules package-lock.json
rm -rf android/.gradle android/build android/app/build
echo "✅ React Native gradle plugin eliminado."
echo "Ejecuta ahora: npm install && npx cap sync android"
