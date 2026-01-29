import { Mic } from 'lucide-react-native';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ActiveScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background px-5 justify-between pb-5">
      
      <View className="mt-5">
        <Text className="text-text font-bold text-xl mb-4">Live Conversation</Text>
        
        {/* Chat Interface Mock */}
        <View className="gap-4">
            <View className="self-end bg-surfaceHighlight px-4 py-3 rounded-2xl rounded-tr-none max-w-[80%]">
                <Text className="text-text">What is this building?</Text>
            </View>
            
            <View className="self-start bg-primary/10 px-4 py-3 rounded-2xl rounded-tl-none max-w-[90%] border border-primary/20">
                <Text className="text-primary font-semibold mb-1">AI Insight</Text>
                <Text className="text-text">That is the Empire State Building, a 102-story Art Deco skyscraper in Midtown Manhattan.</Text>
            </View>
        </View>
      </View>

      {/* Input Area */}
      <View className="flex-row gap-3 items-center">
        <View className="flex-1 bg-surfaceHighlight h-12 rounded-full flex-row items-center px-4 border border-white/5">
            <TextInput 
                placeholder="Type a message..." 
                placeholderTextColor="#64748b"
                className="flex-1 text-white"
            />
        </View>
        <TouchableOpacity className="w-12 h-12 bg-primary rounded-full items-center justify-center">
            <Mic size={24} color="#020617" />
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}