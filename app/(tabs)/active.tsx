import { Cpu, Globe, Mic } from 'lucide-react-native';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useBLE from '../hooks/useBLE';
import useGlassesSocket from '../hooks/useGlassesSocket';

export default function ActiveScreen() {
  const { glassesIP } = useBLE();
  const { 
    images, 
    aiStatus, 
    responseText, 
    userTranscript, // <--- New
    searchSources,  // <--- New
    simulateBurst 
  } = useGlassesSocket(glassesIP);

  return (
    <SafeAreaView className="flex-1 bg-black px-5">
      
      {/* 1. Header */}
      <View className="flex-row justify-between items-center py-4 border-b border-white/10">
        <Text className="text-white font-bold text-xl tracking-wider">INSIGHT HUD</Text>
        <View className="bg-primary/20 px-3 py-1 rounded-full border border-primary/50">
           <Text className="text-primary text-xs font-bold uppercase">{aiStatus}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 mt-4">
        
        {/* 2. Visual Context (Images) */}
        {images.length > 0 && (
            <View className="mb-6">
                <Text className="text-white/50 text-[10px] uppercase mb-2">Visual Context</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {images.map((img, i) => (
                        <Image key={i} source={{ uri: img }} className="w-24 h-24 rounded-lg bg-white/10 mr-2" />
                    ))}
                </ScrollView>
            </View>
        )}

        {/* 3. User Input (Transcription) */}
        {userTranscript ? (
            <View className="self-end bg-white/10 px-4 py-3 rounded-2xl rounded-tr-none mb-6 max-w-[85%]">
                <View className="flex-row items-center gap-2 mb-1">
                    <Mic size={12} color="#94a3b8" />
                    <Text className="text-white/50 text-[10px] uppercase font-bold">You</Text>
                </View>
                <Text className="text-white text-base leading-5">"{userTranscript}"</Text>
            </View>
        ) : null}

        {/* 4. AI Response */}
        {responseText ? (
            <View className="self-start bg-primary/10 px-5 py-4 rounded-2xl rounded-tl-none max-w-[95%] border border-primary/20">
                <View className="flex-row items-center gap-2 mb-2">
                    <Cpu size={14} color="#06b6d4" />
                    <Text className="text-primary text-[10px] uppercase font-bold">AI Response</Text>
                </View>
                
                <Text className="text-white text-lg leading-7 font-medium">
                    {responseText}
                </Text>

                {/* 5. Google Search Sources */}
                {searchSources?.length > 0 && (
                    <View className="mt-4 pt-3 border-t border-white/10">
                        <Text className="text-white/40 text-[10px] uppercase mb-2">Verified Sources</Text>
                        <View className="flex-row flex-wrap gap-2">
                            {searchSources?.map((source, i) => (
                                <TouchableOpacity 
                                    key={i} 
                                    onPress={() => Linking.openURL(source.uri)}
                                    className="flex-row items-center gap-1 bg-black/40 px-2 py-1.5 rounded border border-white/10"
                                >
                                    <Globe size={10} color="#06b6d4" />
                                    <Text className="text-blue-400 text-xs truncate max-w-[150px]" numberOfLines={1}>
                                        {source.title}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        ) : (
             /* Loading State */
             images.length > 0 && (
                 <View className="flex-row items-center gap-3 mt-4">
                     <ActivityIndicator color="#06b6d4" />
                     <Text className="text-white/50 italic">Analyzing visuals & web data...</Text>
                 </View>
             )
        )}

      </ScrollView>

      {/* Dev Controls */}
      <TouchableOpacity onPress={simulateBurst} className="py-4">
        <Text className="text-white/20 text-center text-xs">SIMULATE TRIGGER</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}