# RMZ Wallet
App de eCash (XEC) desarrollada en Ionic + Angular + Capacitor.

## Scripts
- `npm start`: correr en navegador
- `npm run build`: compilar versión web
- `npm run android`: compilar y correr en Android
- `npm run sync`: sincronizar cambios con Android nativo

La app usa ecash-wallet y Chronik API para crear carteras, consultar saldos y enviar transacciones en la red eCash.

### Desarrollo con Web Bluetooth

Para probar las funciones BLE en navegadores Chromium es necesario ejecutar la app en un contexto HTTPS. Puedes usar:

```
ionic serve --ssl --host=localhost --port=8100
```

Esto habilita un certificado autofirmado suficiente para desarrollo local.
