import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

// Enviar TX firmada
export function broadcastTx(txHex) {
  // En un caso real aquí enviarías el txHex como payload vía BLE
  console.log("Broadcasting TX via BLE:", txHex);
}

// Recibir TX firmada
export function listenForTx(callback) {
  manager.startDeviceScan(null, null, (error, device) => {
    if (error) {
      console.error(error);
      return;
    }
    // callback con tx recibida (simulado)
    callback("signed-tx-hex");
  });
}
