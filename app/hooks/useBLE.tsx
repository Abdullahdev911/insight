import * as ExpoDevice from 'expo-device';
import { useMemo, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { atob } from 'react-native-quick-base64'; // Ensure this is installed: npm install react-native-quick-base64

// DEFINED UUIDS
const INSIGHT_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_BATTERY_LEVEL = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CHAR_IP_ADDRESS = '829a2867-275d-4886-81d3-356079d39578'; 

interface BluetoothState {
  isScanning: boolean;
  connectedDevice: Device | null;
  batteryLevel: number;
  glassesIP: string | null;
  status: 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  error: string | null;
}

export default function useBLE() {
  // 1. Initialize BLE Manager (Real)
  const bleManager = useMemo(() => new BleManager(), []);

  const [state, setState] = useState<BluetoothState>({
    isScanning: false,
    connectedDevice: null,
    batteryLevel: 0,
    glassesIP: null,
    status: 'idle',
    error: null,
  });

  // ============================================================
  //  🔥 HOTWIRE MODE (DEV TOOL)
  // ============================================================
  const startScanMock = async () => {
    setState(prev => ({ ...prev, isScanning: true, status: 'scanning', error: null }));
    console.log("Hotwire: Starting mock scan...");
    setTimeout(() => {
        setState(prev => ({ ...prev, isScanning: false, status: 'connecting' }));
        setTimeout(() => {
            setState({
                isScanning: false,
                connectedDevice: { id: 'MOCK', name: 'Insight (Sim)' } as Device,
                batteryLevel: 88, 
                glassesIP: "192.168.43.205", // Mock IP
                status: 'connected', 
                error: null
            });
        }, 1000);
    }, 2000);
  };

  // ============================================================
  //  📡 REAL MODE (PRODUCTION)
  // ============================================================
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
    return true; 
  };

  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setState(prev => ({ ...prev, error: 'Permission denied' }));
      return;
    }

    setState(prev => ({ ...prev, isScanning: true, status: 'scanning', error: null }));

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setState(prev => ({ ...prev, isScanning: false, status: 'error', error: error.message }));
        return;
      }

      // Filter for your ESP32 device name
      if (device && (device.name?.includes("Insight") || device.name?.includes("ESP-EYE"))) {
        bleManager.stopDeviceScan();
        setState(prev => ({ ...prev, isScanning: false, status: 'connecting' }));
        connectToDevice(device);
      }
    });
  };

  const connectToDevice = async (device: Device) => {
    try {
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      // 1. READ IP ADDRESS (Critical Step)
      const ipChar = await connectedDevice.readCharacteristicForService(
        INSIGHT_SERVICE_UUID,
        CHAR_IP_ADDRESS
      );
      
      // Decode Base64 IP (e.g., "MTkyLjE2OC40My41MA==" -> "192.168.43.50")
      const glassesIP = atob(ipChar.value as string); 
      console.log("Glasses IP Found:", glassesIP);

      // 2. READ BATTERY
      const batteryChar = await connectedDevice.readCharacteristicForService(
        INSIGHT_SERVICE_UUID,
        CHAR_BATTERY_LEVEL
      );
      const batteryLevel = batteryChar.value ? parseInt(atob(batteryChar.value)) : 0;

      setState({
        isScanning: false,
        connectedDevice: connectedDevice,
        batteryLevel: batteryLevel,
        glassesIP: glassesIP, // <--- This will trigger the WebSocket hook
        status: 'connected',
        error: null
      });

    } catch (e: any) {
      console.log("Connection Error", e);
      setState(prev => ({ ...prev, status: 'error', error: e.message }));
    }
  };

  return {
    startScan,       // The Real Function
    startScanMock,   // The Dev Helper
    ...state
  };
}