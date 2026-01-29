// hooks/useBLE.ts
import * as ExpoDevice from 'expo-device';
import * as Network from 'expo-network';
import { useMemo, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { atob, btoa } from 'react-native-quick-base64'; // You might need to install this or use a polyfill

// DEFINED UUIDS (Must match your ESP32 Firmware)
// If you haven't defined them on ESP32 yet, use these.
const INSIGHT_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_BATTERY_LEVEL = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CHAR_IP_ADDRESS = '829a2867-275d-4886-81d3-356079d39578'; 

interface BluetoothState {
  isScanning: boolean;
  connectedDevice: Device | null;
  batteryLevel: number;
  status: 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  error: string | null;
}

export default function useBLE() {
  const bleManager = useMemo(() => new BleManager(), []);
  const [state, setState] = useState<BluetoothState>({
    isScanning: false,
    connectedDevice: null,
    batteryLevel: 0,
    status: 'idle',
    error: null,
  });

  // 1. Request Permissions
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
    return true; // iOS handles permissions via Info.plist automatically (configured in app.json)
  };

  // 2. Scan for "Insight" or "ESP-EYE" devices
  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setState(prev => ({ ...prev, error: 'Bluetooth permissions denied' }));
      return;
    }

    setState(prev => ({ ...prev, isScanning: true, status: 'scanning', error: null }));

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log(error);
        setState(prev => ({ ...prev, isScanning: false, status: 'error', error: error.message }));
        return;
      }

      // Filter: Look for a device with a specific name or Service UUID
      if (device && (device.name?.includes("Insight") || device.name?.includes("Pixel 4a") || device.name?.includes("ESP-EYE"))) {
        bleManager.stopDeviceScan();
        setState(prev => ({ ...prev, isScanning: false, status: 'connecting' }));
        connectToDevice(device);
      }
    });
  };

  // 3. Connect & Handshake
  const connectToDevice = async (device: Device) => {
    try {
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      // A. Get Phone's IP
      const ipAddress = await Network.getIpAddressAsync();
      console.log("Phone IP:", ipAddress);

      // B. Send IP to Glasses (Write Characteristic)
      // Note: You need to base64 encode the string for BLE
      const ipEncoded = btoa(ipAddress); 
      await connectedDevice.writeCharacteristicWithResponseForService(
        INSIGHT_SERVICE_UUID,
        CHAR_IP_ADDRESS,
        ipEncoded
      );

      // C. Read Battery Level (Read Characteristic)
      // Assuming the ESP32 sends a single byte or string "82"
      const batteryChar = await connectedDevice.readCharacteristicForService(
        INSIGHT_SERVICE_UUID,
        CHAR_BATTERY_LEVEL
      );
      
      // Decode battery data (depends on how you send it from ESP32)
      // This example assumes it's a simple string "82"
      const batteryLevel = batteryChar.value ? parseInt(atob(batteryChar.value)) : 50;

      setState({
        isScanning: false,
        connectedDevice: connectedDevice,
        batteryLevel: batteryLevel,
        status: 'connected',
        error: null
      });

      // Optional: Setup a "Monitor" to listen for battery changes in real-time
      // setupBatteryMonitor(connectedDevice);

    } catch (e: any) {
      console.log("Connection Error", e);
      setState(prev => ({ ...prev, status: 'error', error: e.message }));
    }
  };

  return {
    startScan,
    ...state
  };
}

// Helper for Base64 (if not using a library)
// function btoa(str: string) {
//     const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
//     let output = '';
//     // ... standard implementation ...
//     // For React Native, it is safer to install: `npm install react-native-quick-base64`
//     // and usage: import { btoa } from 'react-native-quick-base64';
//     return global.btoa ? global.btoa(str) : str; // Fallback
// }

// function atob(str: string) {
//     return global.atob ? global.atob(str) : str;
// }