import { Battery, Eye, Mic } from 'lucide-react-native';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background px-5 pt-5">
      
      {/* Top Status Bar */}
      <View className="flex-row justify-between items-center mb-6">
        <View>
            <Text className="text-text font-bold text-xl">Insight Glasses</Text>
            <View className="flex-row items-center gap-2 mt-1">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-green-500 text-xs font-medium">Connected</Text>
            </View>
        </View>
        <View className="flex-row items-center gap-3 bg-surfaceHighlight px-3 py-1.5 rounded-full">
            <Battery size={18} color="#f8fafc" />
            <Text className="text-text text-xs font-bold">82%</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* Main Visualizer Card */}
        <View className="bg-surfaceHighlight rounded-3xl p-6 items-center justify-center mb-6 border border-white/5 h-64">
           {/* Placeholder for Voice Wave animation */}
           <View className="flex-row items-center gap-1 h-10">
                <View className="w-1 h-4 bg-primary rounded-full animate-pulse" />
                <View className="w-1 h-8 bg-primary rounded-full animate-pulse" />
                <View className="w-1 h-6 bg-primary rounded-full animate-pulse" />
                <View className="w-1 h-10 bg-primary rounded-full animate-pulse" />
                <View className="w-1 h-5 bg-primary rounded-full animate-pulse" />
           </View>
           <Text className="text-textDim mt-4">Wake Word: <Text className="text-primary font-bold">Active</Text></Text>
        </View>

        {/* Quick Actions Grid */}
        <View className="flex-row gap-4 mb-4">
            <TouchableOpacity className="flex-1 bg-surfaceHighlight p-4 rounded-2xl h-32 justify-between border border-white/5">
                <View className="bg-primary/20 w-10 h-10 rounded-full items-center justify-center">
                    <Mic size={20} color="#06b6d4" />
                </View>
                <Text className="text-text font-semibold">Ask AI</Text>
            </TouchableOpacity>

            <TouchableOpacity className="flex-1 bg-surfaceHighlight p-4 rounded-2xl h-32 justify-between border border-white/5">
                <View className="bg-green-500/20 w-10 h-10 rounded-full items-center justify-center">
                    <Eye size={20} color="#22c55e" />
                </View>
                <Text className="text-text font-semibold">Start Passive Mode</Text>
            </TouchableOpacity>
        </View>

        {/* Recent Context Snapshot */}
        <View className="bg-surfaceHighlight p-4 rounded-2xl mb-6 border border-white/5">
            <Text className="text-textDim text-xs uppercase tracking-wider mb-3">Last Processed Image</Text>
            <View className="h-40 bg-black rounded-xl w-full items-center justify-center overflow-hidden">
                {/* Mock Image Placeholder */}
                <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?q=80&w=2574&auto=format&fit=crop' }} 
                    className="w-full h-full opacity-60"
                />
                <View className="absolute bottom-0 left-0 right-0 p-3 bg-black/60 backdrop-blur-md">
                    <Text className="text-white text-xs">Identified: Coffee Cup, Laptop</Text>
                </View>
            </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}