import { ChevronRight, Check } from 'lucide-react-native';
import { ScrollView, Switch, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from './../context/AppContext';

export default function SettingsScreen() {
  const { isLocationEnabled, setIsLocationEnabled, geminiVoice, setGeminiVoice } = useApp();

  const VOICES = [
    { id: 'Puck', label: 'Puck (Default)' },
    { id: 'Charon', label: 'Charon' },
    { id: 'Kore', label: 'Kore' },
    { id: 'Fenrir', label: 'Fenrir' },
    { id: 'Aoede', label: 'Aoede' },
    { id: 'Zephyr', label: 'Zephyr' }
  ];

  return (
    <SafeAreaView className="flex-1 bg-background px-5 pt-5">
      <Text className="text-text font-bold text-2xl mb-6">Settings</Text>

      <ScrollView>
        {/* Section 1 */}
        <View className="mb-8">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest mb-4">Device Control</Text>
            
            <View className="bg-surfaceHighlight rounded-2xl overflow-hidden border border-white/5">
                <View className="p-4 flex-row justify-between items-center border-b border-white/5">
                    <Text className="text-text font-medium">Wake Word Sensitivity</Text>
                    <Switch trackColor={{ false: "#334155", true: "#06b6d4" }} thumbColor={"#f8fafc"} value={true} />
                </View>
                <View className="p-4 flex-row justify-between items-center">
                    <Text className="text-text font-medium">Passive Mode Interval</Text>
                    <View className="flex-row items-center gap-2">
                        <Text className="text-textDim text-sm">5 Mins</Text>
                        <ChevronRight size={16} color="#64748b" />
                    </View>
                </View>
            </View>
        </View>

        {/* Section - AI Voice */}
        <View className="mb-8">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest mb-4">AI Voice</Text>
            
            <View className="bg-surfaceHighlight rounded-2xl overflow-hidden border border-white/5">
                {VOICES.map((voice, idx) => (
                    <TouchableOpacity 
                        key={voice.id} 
                        onPress={() => setGeminiVoice(voice.id)}
                        className={`p-4 flex-row justify-between items-center ${idx !== VOICES.length - 1 ? 'border-b border-white/5' : ''}`}
                    >
                        <Text className="text-text font-medium">{voice.label}</Text>
                        {geminiVoice === voice.id && <Check size={18} color="#06b6d4" />}
                    </TouchableOpacity>
                ))}
            </View>
        </View>

        {/* Section 2 */}
        <View className="mb-8">
            <Text className="text-primary text-xs font-bold uppercase tracking-widest mb-4">Data & Privacy</Text>
            
            <View className="bg-surfaceHighlight rounded-2xl overflow-hidden border border-white/5">
                <View className="p-4 flex-row justify-between items-center border-b border-white/5">
                    <Text className="text-text font-medium">Save Logs Locally</Text>
                    <Switch trackColor={{ false: "#334155", true: "#06b6d4" }} thumbColor={"#f8fafc"} value={true} />
                </View>
                <View className="p-4 flex-row justify-between items-center border-b border-white/5">
                    <Text className="text-text font-medium">Cloud Processing</Text>
                    <Switch trackColor={{ false: "#334155", true: "#06b6d4" }} thumbColor={"#f8fafc"} value={true} />
                </View>
                <View className="p-4 flex-row justify-between items-center border-b border-white/5">
                    <Text className="text-text font-medium">Allow Location Access</Text>
                    <Switch trackColor={{ false: "#334155", true: "#06b6d4" }} thumbColor={"#f8fafc"} value={isLocationEnabled} onValueChange={setIsLocationEnabled} />
                </View>
                <View className="p-4 flex-row justify-between items-center">
                    <Text className="text-text font-medium">API Key Config</Text>
                    <ChevronRight size={16} color="#64748b" />
                </View>
            </View>
        </View>

        <Text className="text-center text-textDim text-xs">Insight App v1.2.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}