// hooks/useBLE.ts
import { useMemo, useState } from 'react';
import { Device } from 'react-native-ble-plx';
// import * as ExpoDevice from 'expo-device';
// import { PermissionsAndroid, Platform } from 'react-native';
// import { atob } from 'react-native-quick-base64'; 

// DEFINED UUIDS (Must match your ESP32 Firmware)
const INSIGHT_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_BATTERY_LEVEL = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CHAR_IP_ADDRESS = '829a2867-275d-4886-81d3-356079d39578'; 

interface BluetoothState {
  isScanning: boolean;
  connectedDevice: Device | null;
  batteryLevel: number;
  glassesIP: string | null; // <--- ADDED THIS
  status: 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  error: string | null;
}

export default function useBLE() {
  // Mocking manager for development so it doesn't crash without Native Modules
  const bleManager = useMemo(() => ({}), []); 
  // const bleManager = useMemo(() => new BleManager(), []); // <--- Use this for real build

  const [state, setState] = useState<BluetoothState>({
    isScanning: false,
    connectedDevice: null,
    batteryLevel: 0,
    glassesIP: null,
    status: 'idle',
    error: null,
  });

  // ============================================================
  //  🔥 HOTWIRE MODE (ACTIVE) - FOR DEV WITHOUT HARDWARE
  // ============================================================
  const startScan = async () => {
    setState(prev => ({ ...prev, isScanning: true, status: 'scanning', error: null }));
    console.log("Hotwire: Starting mock scan...");

    setTimeout(() => {
        console.log("Hotwire: Device found, connecting...");
        setState(prev => ({ ...prev, isScanning: false, status: 'connecting' }));
        
        setTimeout(() => {
            console.log("Hotwire: Connected!");
            setState({
                isScanning: false,
                connectedDevice: { 
                    id: 'MOCK_DEVICE_001', 
                    name: 'Insight Glasses (Sim)' 
                } as Device,
                batteryLevel: 88, 
                glassesIP: "192.168.43.205", // <--- MOCK IP (Simulating Hotspot assignment)
                status: 'connected', 
                error: null
            });
        }, 1000);
    }, 2000);
  };

  // ============================================================
  //  📡 REAL MODE (COMMENTED OUT) - UNCOMMENT FOR PRODUCTION
  // ============================================================
  /*
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

  const startScanReal = async () => {
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
      
      // 1. READ IP ADDRESS (New Architecture)
      // The ESP32 connected to your Hotspot and put ITS IP into this char.
      const ipChar = await connectedDevice.readCharacteristicForService(
        INSIGHT_SERVICE_UUID,
        CHAR_IP_ADDRESS
      );
      const glassesIP = atob(ipChar.value); 
      console.log("Glasses found at IP:", glassesIP);

      // 2. READ BATTERY
      const batteryChar = await connectedDevice.readCharacteristicForService(
        INSIGHT_SERVICE_UUID,
        CHAR_BATTERY_LEVEL
      );
      const batteryLevel = batteryChar.value ? parseInt(atob(batteryChar.value)) : 50;

      setState({
        isScanning: false,
        connectedDevice: connectedDevice,
        batteryLevel: batteryLevel,
        glassesIP: glassesIP, // Store IP for WebSocket use later
        status: 'connected',
        error: null
      });

    } catch (e: any) {
      console.log("Connection Error", e);
      setState(prev => ({ ...prev, status: 'error', error: e.message }));
    }
  };
  */

  return {
    startScan,
    // startScan: startScanReal, // <--- Swap this when ready
    ...state
  };
}