// src/App.js
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Button,
  Alert,
  Modal,
  Pressable,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';

import { createWallet, getBalance /* , signTx */ } from './core/wallet';
// import { broadcastTx } from './ble/mesh';

// ✅ Formateador local que NO divide ni cambia unidades
const formatXec = n => Number(n ?? 0).toFixed(2);

// Si usas este helper, mantenlo. Si no, puedes quitarlo.
import { truncateAddr } from './core/units';

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState(0);
  const [showQR, setShowQR] = useState(false);

  // Restaurar cartera si existe
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('rmz_wallet');
        if (saved) {
          const w = JSON.parse(saved);
          setWallet(w);
          setAddress(w.address);
          try {
            // ⚠️ getBalance YA devuelve XEC
            const bal = await getBalance(w.address);
            setBalance(bal);
          } catch {}
        }
      } catch (e) {
        console.error('restore wallet error:', e);
      }
    })();
  }, []);

  const handleCreate = async () => {
    try {
      const w = await createWallet();
      setWallet(w);
      setAddress(w.address);
      await AsyncStorage.setItem('rmz_wallet', JSON.stringify(w));
      // ⚠️ getBalance YA devuelve XEC
      const bal = await getBalance(w.address);
      setBalance(bal);
    } catch (err) {
      console.error('createWallet error:', err);
      Alert.alert('Error', String(err?.message || err));
    }
  };

  const handleRefresh = async () => {
    try {
      const addr = address || wallet?.address;
      if (!addr) return;
      // ⚠️ getBalance YA devuelve XEC
      const bal = await getBalance(addr);
      setBalance(bal);
    } catch (e) {
      console.error('getBalance error:', e);
      Alert.alert('Saldo', 'No se pudo actualizar el saldo');
    }
  };

  const handleShowMnemonic = () => {
    if (!wallet?.mnemonic) return;
    Alert.alert('Mnemónica', wallet.mnemonic);
  };

  const handleSend = async () => {
    try {
      if (!wallet) return;
      // TODO: dirección de destino y construcción de TX real
      // const to = 'ecash:qq....';
      // const amountSats = 100 * 100; // 100 XEC -> 100*100 sats
      // const { hex } = await signTx(wallet, to, amountSats);
      // await broadcastTx(hex);
      Alert.alert('Demo', 'Envío vía BLE por implementar');
    } catch (e) {
      console.error('send error:', e);
      Alert.alert('Error', String(e?.message || e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#12181f' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontWeight: 'bold', fontSize: 24, color: 'white', marginBottom: 16 }}>
          RMZ Wallet
        </Text>

        <Button title="CREAR CARTERA" onPress={handleCreate} />

        {/* Dirección */}
        {!!address && (
          <View style={{ marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: '#28323b' }}>
            <Text style={{ marginBottom: 6, color: '#cfd8dc' }}>Dirección:</Text>
            <Text selectable style={{ color: 'white', marginBottom: 8 }}>
              {address}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  Clipboard.setString(address);
                  Alert.alert('Copiado', 'Dirección copiada al portapapeles');
                }}
                style={{
                  backgroundColor: '#455a64',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  marginRight: 12,
                }}
              >
                <Text style={{ color: 'white' }}>Copiar</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowQR(true)}
                style={{
                  backgroundColor: '#455a64',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: 'white' }}>Ver QR</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Mnemónica */}
        <View style={{ marginTop: 16 }}>
          <Button title="VER MNEMÓNICA (¡NO COMPARTIR!)" onPress={handleShowMnemonic} />
        </View>

        {/* Saldo */}
        <Text style={{ marginVertical: 16, color: 'white' }}>
          Saldo: {formatXec(balance)} XEC
        </Text>

        <View style={{ marginBottom: 12 }}>
          <Button title="ACTUALIZAR SALDO" onPress={handleRefresh} />
        </View>

        <Button title="ENVIAR TX (BLE DEMO)" onPress={handleSend} />
      </ScrollView>

      {/* Modal QR */}
      <Modal
        visible={showQR}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQR(false)}
      >
        <Pressable
          onPress={() => setShowQR(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              padding: 20,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ marginBottom: 12, fontWeight: '600' }}>
              {truncateAddr(address)}
            </Text>
            <QRCode value={address || ''} size={220} />
            <Pressable onPress={() => setShowQR(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: '#1976d2' }}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
