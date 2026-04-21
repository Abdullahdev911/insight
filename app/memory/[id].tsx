import { ChevronLeft, Clock, MessageSquare, Tag, Type, Send, Cpu, Mic, Trash2 } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { 
  Dimensions, 
  FlatList, 
  Image, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { GeminiRestService, PassiveSessionResult } from '../services/GeminiRestService';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { deleteChat } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<{role: string, text: string}[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const path = `${FileSystem.documentDirectory}chat_${id}.json`;
        const exists = await FileSystem.getInfoAsync(path);
        if (exists.exists) {
          const content = await FileSystem.readAsStringAsync(path);
          const parsed = JSON.parse(content);
          setData(parsed);
          if (parsed.chatHistory) {
            setChat(parsed.chatHistory);
          }
        }
      } catch (e) {
        console.error("Failed to load memory:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  const handleAsk = async () => {
    if (!inputText.trim() || isAsking) return;
    
    setIsAsking(true);
    const userMsg = inputText;
    setInputText('');
    setChat(prev => [...prev, { role: 'user', text: userMsg }]);
    
    try {
      const response = await GeminiRestService.queryMemory(data, userMsg);
      const newChat = [...chat, { role: 'user', text: userMsg }, { role: 'bot', text: response }];
      setChat(newChat);

      // Save to Disk
      const path = `${FileSystem.documentDirectory}chat_${id}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify({
        ...data,
        chatHistory: newChat
      }));
    } catch (e) {
      console.error(e);
      const failedChat = [...chat, { role: 'user', text: userMsg }, { role: 'bot', text: "Sorry, I couldn't process your request right now." }];
      setChat(failedChat);
    } finally {
      setIsAsking(false);
    }
  };
  
  const handleDelete = () => {
    Alert.alert(
      "Delete Memory",
      "Are you sure you want to permanently delete this memory?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            await deleteChat(id as string);
            router.back();
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-5">
        <Text className="text-white text-lg text-center">Memory not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-5 bg-primary px-6 py-2 rounded-full">
           <Text className="text-black font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white font-bold text-lg" numberOfLines={1}>{data.title}</Text>
          <Text className="text-white/40 text-xs">Passive Memory • 5 Mins</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} className="p-2 bg-red-500/10 rounded-full mr-2">
            <Trash2 size={18} color="#ef4444" />
        </TouchableOpacity>
        <View className="bg-primary/20 px-3 py-1 rounded-full flex-row items-center">
            <Tag size={12} color="#06b6d4" />
            <Text className="text-primary text-[10px] font-bold ml-1 uppercase">ARCHIVED</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        className="flex-1"
      >
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          className="flex-1 px-5 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          
          {/* Summary Section */}
          <View className="bg-surfaceHighlight p-5 rounded-3xl mb-8 border border-white/5">
             <View className="flex-row items-center mb-3">
                <Type size={18} color="#06b6d4" />
                <Text className="text-primary font-bold ml-2 uppercase tracking-widest text-xs">Summary</Text>
             </View>
             <Text className="text-white leading-6 text-base opacity-80">{data.summary}</Text>
          </View>

          {/* Transcript Timeline */}
          <View className="mb-8">
            <View className="flex-row items-center mb-6">
                <Clock size={18} color="#06b6d4" />
                <Text className="text-primary font-bold ml-2 uppercase tracking-widest text-xs">Transcript Timeline</Text>
            </View>
            
            {data.transcript.map((item: any, idx: number) => (
              <View key={idx} className="flex-row mb-6">
                 <View className="items-center mr-4 w-12">
                   <Text className="text-primary font-bold text-xs">{item.time}</Text>
                   <View className="w-[1px] flex-1 bg-white/10 my-2" />
                 </View>
                 <View className="flex-1 pt-0.5">
                   <Text className="text-white/40 text-[10px] font-bold uppercase mb-1">{item.speaker || 'SPEAKER'}</Text>
                   <Text className="text-white text-base leading-6 opacity-90">{item.text}</Text>
                 </View>
              </View>
            ))}
          </View>

          {/* Visual Evidence (Images) */}
          <View className="mb-8">
            <View className="flex-row items-center mb-6">
                <Clock size={18} color="#06b6d4" />
                <Text className="text-primary font-bold ml-2 uppercase tracking-widest text-xs">Visual Timeline</Text>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 px-5">
               {data.images.map((img: string, idx: number) => (
                 <View key={idx} className="mr-4 w-60">
                    <Image source={{ uri: img }} className="w-60 h-40 rounded-2xl bg-white/5" resizeMode="cover" />
                    <View className="mt-2 bg-white/5 p-3 rounded-xl border border-white/5">
                        <Text className="text-white/40 text-[10px] font-bold mb-1">IMAGE {idx + 1}</Text>
                        <Text className="text-white/80 text-xs leading-4" numberOfLines={2}>
                          {data.imageLabels[idx]?.label || "Analyzing scene..."}
                        </Text>
                    </View>
                 </View>
               ))}
            </ScrollView>
          </View>

          {/* Q&A Section History */}
          <View className="mb-4">
             <View className="flex-row items-center mb-4">
                <MessageSquare size={18} color="#06b6d4" />
                <Text className="text-primary font-bold ml-2 uppercase tracking-widest text-xs">Ask Insight about this memory</Text>
             </View>
             
             {chat.map((m, i) => {
               const isUser = m.role === 'user';
               return (
                 <View key={i} className={`mb-4 max-w-[85%] px-4 py-3 ${isUser 
                   ? 'bg-white/10 self-end rounded-2xl rounded-tr-sm' 
                   : 'bg-primary/10 self-start rounded-2xl rounded-tl-sm border border-primary/20'}`}>
                    {!isUser && (
                      <View className="flex-row items-center gap-2 mb-2">
                        <Cpu size={12} color="#06b6d4" />
                        <Text className="text-primary text-[10px] uppercase font-bold">Insight</Text>
                      </View>
                    )}
                    {isUser && (
                      <View className="flex-row items-center justify-end gap-2 mb-1">
                        <Text className="text-white/50 text-[10px] uppercase font-bold">You</Text>
                        <Mic size={10} color="#94a3b8" />
                      </View>
                    )}
                    <Text className="text-white text-base leading-6">{m.text}</Text>
                 </View>
               );
             })}

             {isAsking && (
               <View className="mb-4 max-w-[85%] px-4 py-3 bg-primary/10 self-start rounded-2xl rounded-tl-sm border border-primary/20">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Cpu size={12} color="#06b6d4" />
                    <Text className="text-primary text-[10px] uppercase font-bold italic">Insight is thinking...</Text>
                  </View>
                  <ActivityIndicator size="small" color="#06b6d4" style={{ alignSelf: 'flex-start' }} />
               </View>
             )}
          </View>
          <View className="h-10" />
        </ScrollView>

        {/* Input area fixed at bottom of KeyboardAvoidingView */}
        <View className="px-5 py-4 bg-background border-t border-white/5">
          <View className="flex-row items-center bg-surfaceHighlight rounded-3xl p-2 border border-white/10">
            <TextInput 
                placeholder="Ask about this memory..."
                placeholderTextColor="#64748b"
                className="flex-1 px-4 py-3 text-white"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleAsk}
            />
            <TouchableOpacity 
                onPress={handleAsk} 
                disabled={!inputText.trim() || isAsking}
                className={`p-3 rounded-full ${inputText.trim() && !isAsking ? 'bg-primary' : 'bg-white/5'}`}
            >
                <Send size={20} color={inputText.trim() && !isAsking ? "black" : "#334155"} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
