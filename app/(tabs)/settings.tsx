import { ChevronRight } from 'lucide-react-native';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
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