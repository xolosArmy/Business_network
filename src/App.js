// src/App.js
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Button, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createWallet, walletFromMnemonic, getBalance, signTx } from './core/wallet';
// import { broadcastTx } from './ble/mesh'; // aún no usado

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [address, setAddress] = useState('');

  // Restaurar al abrir la app
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('rmz_wallet');
        if (!raw) return;

        const saved = JSON.parse(raw);
        // Preferimos restaurar desde la mnemónica guardada
        const w = await walletFromMnemonic(saved.mnemonic);
        setWallet(w);
        setAddress(w.address);

        const bal = await getBalance(w.address);
        setBalance(bal);
      } catch (e) {
        console.error('restore wallet error:', e);
        // No borramos nada automáticamente; solo informamos.
        Alert.alert(
          'Restauración fallida',
          'No se pudo validar la mnemónica guardada. Revisa las 12 palabras o vuelve a crear la cartera.'
        );
      }
    })();
  }, []);

  const handleCreate = async () => {
    try {
      const w = await createWallet();
      setWallet(w);
      setAddress(w.address);
      await AsyncStorage.setItem('rmz_wallet', JSON.stringify({ mnemonic: w.mnemonic }));
      const bal = await getBalance(w.address);
      setBalance(bal);
    } catch (err) {
      console.error('createWallet error:', err);
    }
  };

  const handleShowMnemonic = () => {
    if (!wallet) return;
    Alert.alert('Mnemónica', wallet.mnemonic);
  };

  const handleRefresh = async () => {
    if (!address) return;
    const bal = await getBalance(address);
    setBalance(bal);
  };

  const handleSend = async () => {
    try {
      if (!wallet) return;
      const to = 'ecash:qpxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const tx = await signTx(wallet, to, 1000);
      // await broadcastTx(tx);
      console.log('TX demo:', tx);
    } catch (err) {
      console.error('send error:', err);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 12 }}>
          RMZ Wallet
        </Text>

        <Button title="Crear cartera" onPress={handleCreate} />

        {!!address && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ marginBottom: 6 }}>Dirección:</Text>
            <Text selectable>{address}</Text>
          </View>
        )}

        <View style={{ height: 12 }} />

        <Button title="Ver mnemónica (¡NO compartir!)" onPress={handleShowMnemonic} />

        <Text style={{ marginVertical: 16 }}>Saldo: {balance} XEC</Text>

        <Button title="Actualizar saldo" onPress={handleRefresh} />

        <View style={{ height: 12 }} />

        <Button title="Enviar TX (BLE demo)" onPress={handleSend} />
      </ScrollView>
    </SafeAreaView>
  );
}
