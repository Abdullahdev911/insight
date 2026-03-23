import { useRouter } from 'expo-router';
import { Code, Scan, Bluetooth, Eye, Monitor } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from './context/AppContext';

export default function ConnectionScreen() {
  const router = useRouter();
  
  const { 
    startScan, 
    startScanMock, 
    isScanning, 
    cameraIP, 
    displayIP, 
    isFullyConnected 
  } = useApp();

  // --- AUTO-REDIRECT ---
  // When both boards are found on the hotspot, move to the Active UI
  useEffect(() => {
    if (isFullyConnected) {
      setTimeout(() => {
        router.replace({ pathname: '/(tabs)/active' });
      }, 1500);
    }
  }, [isFullyConnected]);

  // --- DYNAMIC STATUS TEXT ---
  let statusText = "Tap scan to initialize system";
  if (isScanning) statusText = "Searching Hotspot for Hardware...";
  if (cameraIP && !displayIP) statusText = "Vision Node found. Waiting for Display...";
  if (!cameraIP && displayIP) statusText = "Display Node found. Waiting for Vision...";
  if (isFullyConnected) statusText = "All Systems Linked. Booting...";

  return (
    <SafeAreaView className="flex-1 bg-black px-6 justify-between py-10">
      
      {/* Header */}
      <View className="items-center mt-10">
        <Text className="text-[#06b6d4] text-xl font-bold tracking-widest uppercase mb-2">
          Insight OS
        </Text>
        <Text className="text-white/50 text-sm">System Initialization</Text>
      </View>

      {/* Radar / Scanning Visual */}
      <View className="items-center justify-center">
        <View className="w-64 h-64 rounded-full border border-white/10 items-center justify-center bg-white/5">
          {isScanning ? (
            <ActivityIndicator size="large" color="#06b6d4" />
          ) : (
            <View className={`w-40 h-40 rounded-full items-center justify-center ${isFullyConnected ? 'bg-[#06b6d4]/20' : 'bg-white/10'}`}>
               <Bluetooth size={60} color={isFullyConnected ? "#06b6d4" : "#475569"} />
            </View>
          )}
        </View>
        <Text className="text-white/50 mt-8 text-center h-5">
          {statusText}
        </Text>
      </View>

      <View className="w-full">
        {/* If at least one device is found, show the Hardware Status Dashboard */}
        {(cameraIP || displayIP) ? (
          <View className="bg-white/5 p-4 rounded-xl mb-8 border border-white/10 space-y-4">
            
            {/* Vision/Audio Node Status (ESP-EYE) */}
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Eye size={20} color={cameraIP ? "#06b6d4" : "#475569"} />
                <View>
                  <Text className="text-white font-semibold text-base">Vision/Audio Node</Text>
                  <Text className="text-white/50 text-xs">{cameraIP ? `IP: ${cameraIP}` : 'Waiting...'}</Text>
                </View>
              </View>
              <View className={`${cameraIP ? 'bg-green-500/20' : 'bg-yellow-500/20'} px-3 py-1.5 rounded-full`}>
                <Text className={`${cameraIP ? 'text-green-400' : 'text-yellow-400'} font-bold text-[10px] uppercase`}>
                  {cameraIP ? 'Online' : 'Pending'}
                </Text>
              </View>
            </View>

            <View className="h-[1px] w-full bg-white/10 mb-3" />

            {/* Display Node Status (ESP32-C3) */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Monitor size={20} color={displayIP ? "#06b6d4" : "#475569"} />
                <View>
                  <Text className="text-white font-semibold text-base">OLED Display Node</Text>
                  <Text className="text-white/50 text-xs">{displayIP ? `IP: ${displayIP}` : 'Waiting...'}</Text>
                </View>
              </View>
              <View className={`${displayIP ? 'bg-green-500/20' : 'bg-yellow-500/20'} px-3 py-1.5 rounded-full`}>
                <Text className={`${displayIP ? 'text-green-400' : 'text-yellow-400'} font-bold text-[10px] uppercase`}>
                  {displayIP ? 'Online' : 'Pending'}
                </Text>
              </View>
            </View>

          </View>
        ) : (
          <>
            {/* REAL SCAN BUTTON */}
            <TouchableOpacity 
                onPress={startScan}
                disabled={isScanning}
                className={`w-full border border-[#06b6d4]/50 py-4 rounded-2xl items-center flex-row justify-center gap-2 ${isScanning ? 'opacity-50 bg-transparent' : 'bg-white/5'}`}
            >
                <Scan size={20} color="#06b6d4" />
                <Text className="text-[#06b6d4] font-bold text-lg">
                    {isScanning ? "Scanning Network..." : "Initialize System"}
                </Text>
            </TouchableOpacity>

            {/* DEV BYPASS BUTTON */}
            <TouchableOpacity 
                onPress={startScanMock}
                disabled={isScanning}
                className="mt-6 flex-row items-center justify-center gap-2 opacity-50 active:opacity-100"
            >
                <Code size={14} color="#64748b" />
                <Text className="text-white/50 text-xs uppercase tracking-widest font-bold">
                    Developer Bypass
                </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}