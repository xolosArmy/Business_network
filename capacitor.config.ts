import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rmz.wallet',
  appName: 'RMZ Wallet',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Escaneando dispositivos cercanos...',
        connecting: 'Conectando con dispositivo...',
        connected: 'Dispositivo conectado',
        scanAgain: 'Escanear otra vez',
        cancel: 'Cancelar',
      },
    },
  },
};

export default config;
