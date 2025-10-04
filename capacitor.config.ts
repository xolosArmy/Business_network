import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rmz.wallet',
  appName: 'RMZ Wallet',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Escaneando dispositivos BLE...',
        scanAgain: 'Escanear otra vez',
        cancel: 'Cancelar',
      },
    },
  },
};

export default config;
