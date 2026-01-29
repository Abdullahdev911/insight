import { useRouter } from 'expo-router';
import { AlertCircle, Bluetooth, Scan, Zap } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useBLE from './hooks/useBLE'; // Import your new hook

export default function BluetoothScreen() {
  const router = useRouter();
  
  // Use the custom hook
  const { startScan, isScanning, connectedDevice, status, error, batteryLevel } = useBLE();

  // Auto-redirect when connected
  useEffect(() => {
    if (status === 'connected') {
      // Pass the battery level to the next screen via params or Global Store
      // For now, we just navigate
      setTimeout(() => {
        router.replace({
            pathname: '/(tabs)/home',
            params: { battery: batteryLevel } // We can read this in Home
        });
      }, 1000);
    }
  }, [status]);

  return (
    <SafeAreaView className="flex-1 bg-background px-6 justify-between py-10">
      
      <View className="items-center mt-10">
        <Text className="text-primary text-xl font-bold tracking-widest uppercase mb-2">Insight Glasses</Text>
        <Text className="text-textDim text-sm">Device Pairing</Text>
      </View>

      <View className="items-center justify-center">
        <View className="w-64 h-64 rounded-full border border-surfaceHighlight items-center justify-center bg-surface/30">
          {isScanning ? (
            <ActivityIndicator size="large" color="#06b6d4" />
          ) : (
            <View className={`w-40 h-40 rounded-full items-center justify-center ${status === 'connected' ? 'bg-primary/20' : 'bg-surfaceHighlight'}`}>
               <Bluetooth size={60} color={status === 'connected' ? "#06b6d4" : "#475569"} />
            </View>
          )}
        </View>
        <Text className="text-textDim mt-8 text-center h-5">
          {status === 'scanning' ? "Searching for Insight Glasses..." : 
           status === 'connecting' ? "Handshaking..." :
           status === 'connected' ? "Pairing Complete" :
           "Tap scan to find your glasses"}
        </Text>
      </View>

      <View className="w-full">
        {/* Error Display */}
        {error && (
            <View className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-4 flex-row items-center gap-2">
                <AlertCircle size={20} color="#ef4444" />
                <Text className="text-red-400 text-xs flex-1">{error}</Text>
            </View>
        )}

        {connectedDevice ? (
          <View className="bg-surfaceHighlight p-4 rounded-xl flex-row items-center justify-between mb-8 border border-white/5">
            <View className="flex-row items-center gap-3">
              <Zap size={20} color="#06b6d4" fill="#06b6d4" />
              <View>
                <Text className="text-text font-semibold text-lg">{connectedDevice.name}</Text>
                <Text className="text-textDim text-xs">Battery: {batteryLevel}%</Text>
              </View>
            </View>
            <View className="bg-green-500/20 px-4 py-2 rounded-full">
              <Text className="text-green-400 font-bold text-xs">Linked</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity 
            onPress={startScan}
            disabled={isScanning}
            className={`w-full border border-primary/50 py-4 rounded-2xl items-center flex-row justify-center gap-2 ${isScanning ? 'opacity-50 bg-transparent' : 'bg-surfaceHighlight'}`}
          >
            <Scan size={20} color="#06b6d4" />
            <Text className="text-primary font-bold text-lg">
                {isScanning ? "Scanning..." : "Scan for Devices"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}