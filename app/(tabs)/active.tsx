import { Radio, Send } from 'lucide-react-native';
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useGlassesSocket from '../hooks/useGlassesSocket'; // Import the hook

export default function ActiveScreen() {
  // In production, this IP comes from your Global Store / Context
  const glassesIP = "192.168.43.205"; 
  
  const { isConnected, isStreaming, statusMessage, images, simulateBurst } = useGlassesSocket(glassesIP);

  return (
    <SafeAreaView className="flex-1 bg-background px-5 justify-between pb-5">
      
      {/* 1. Header & Connection Status */}
      <View className="mt-5">
        <View className="flex-row justify-between items-center mb-6">
            <Text className="text-text font-bold text-xl">Query Console</Text>
            <View className="flex-row items-center gap-2 bg-surfaceHighlight px-3 py-1.5 rounded-full border border-white/5">
                <View className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <Text className="text-textDim text-xs font-medium uppercase">{statusMessage}</Text>
            </View>
        </View>

        {/* 2. Visualizer Area (The "Packet Train" Receiver) */}
        <View className="bg-surfaceHighlight rounded-3xl p-4 min-h-[300px] border border-white/5 justify-center">
            
            {/* If streaming, show the images arriving in real-time */}
            {images.length > 0 ? (
                <View className="flex-1">
                     <Text className="text-primary text-xs font-bold uppercase tracking-widest mb-3">
                        Captured Context ({images.length} Frames)
                     </Text>
                     
                     {/* Image Grid */}
                     <View className="flex-row flex-wrap gap-2">
                        {images.map((imgUri, index) => (
                            <Image 
                                key={index} 
                                source={{ uri: imgUri }} 
                                className="w-24 h-24 rounded-lg bg-black/50 border border-white/10"
                                resizeMode="cover"
                            />
                        ))}
                        {isStreaming && (
                            <View className="w-24 h-24 rounded-lg bg-black/20 border border-white/10 items-center justify-center border-dashed">
                                <ActivityIndicator color="#06b6d4" />
                            </View>
                        )}
                     </View>

                     {/* Processing State */}
                     {!isStreaming && (
                         <View className="mt-6 bg-primary/10 p-4 rounded-xl border border-primary/20 flex-row items-center gap-3">
                            <ActivityIndicator size="small" color="#06b6d4" />
                            <Text className="text-primary font-semibold">Analyzing with Gemini...</Text>
                         </View>
                     )}
                </View>
            ) : (
                // Empty State
                <View className="items-center opacity-50">
                    <Radio size={48} color="#64748b" />
                    <Text className="text-textDim mt-4 text-center">
                        Waiting for wake word...{'\n'}
                        <Text className="text-xs">"Hey Insight, what is this?"</Text>
                    </Text>
                </View>
            )}
        </View>
      </View>
      
      {/* 3. DEBUG CONTROLS (Since we have no hardware) */}
      <View>
          <Text className="text-white/20 text-xs text-center mb-2 uppercase tracking-widest">Developer Controls</Text>
          <TouchableOpacity 
            onPress={simulateBurst}
            className="bg-surfaceHighlight border border-primary/30 py-3 rounded-xl items-center mb-6 active:bg-primary/10"
          >
            <Text className="text-primary font-bold">Simulate "Wake Word" Trigger</Text>
          </TouchableOpacity>

          {/* Chat Interface Mock */}
          <View className="flex-row gap-3 items-center">
            <View className="flex-1 bg-surfaceHighlight h-12 rounded-full flex-row items-center px-4 border border-white/5">
                <TextInput 
                    placeholder="Type a message..." 
                    placeholderTextColor="#64748b"
                    className="flex-1 text-white"
                />
            </View>
            <TouchableOpacity className="w-12 h-12 bg-primary rounded-full items-center justify-center">
                <Send size={20} color="#020617" />
            </TouchableOpacity>
          </View>
      </View>

    </SafeAreaView>
  );
}