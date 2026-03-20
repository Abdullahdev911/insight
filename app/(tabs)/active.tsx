import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Image,
  Linking,
  Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cpu, Globe, Mic, Menu, X, Plus, Send } from 'lucide-react-native';
import useBLE from '../hooks/useBLE';
import useGlassesSocket from '../hooks/useGlassesSocket';
import useGeminiLive from '../hooks/useGeminiLive';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ActiveScreen() {
  const { glassesIP } = useBLE();
  
  // 1. Hardware Data (Images & Sources)
  const { images, searchSources } = useGlassesSocket(glassesIP);
  
  // 2. Gemini Live API
  const { 
    isConnected, 
    status, 
    userTranscript, 
    responseText, 
    sendText,
    simulateBurst
  } = useGeminiLive();

  // Chat State
  const [inputText, setInputText] = useState('');
  const [chatHistory, setChatHistory] = useState<{id: string, text: string, sender: 'user' | 'bot'}[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // --- Sidebar Animation Logic ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  const toggleSidebar = () => {
    Keyboard.dismiss();
    const toValue = isSidebarOpen ? -SCREEN_WIDTH : 0;
    Animated.timing(slideAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setIsSidebarOpen(!isSidebarOpen);
  };

  // --- Message Handling ---
  const handleSendText = () => {
    if (!inputText.trim()) return;
    
    // Add user message to history instantly
    setChatHistory(prev => [...prev, { id: Date.now().toString(), text: inputText, sender: 'user' }]);
    
    // Send to Gemini WebSocket
    if (sendText) {
      sendText(inputText);
    }
    
    setInputText('');
  };

  // Render Chat Bubbles
  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.sender === 'user';
    return (
      <View className={`mb-4 max-w-[85%] px-4 py-3 ${
        isUser 
          ? 'bg-white/10 self-end rounded-2xl rounded-tr-sm' 
          : 'bg-primary/10 self-start rounded-2xl rounded-tl-sm border border-primary/20'
      }`}>
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
        <Text className="text-white text-base leading-6">{item.text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* KEYBOARD FIX: 
        - iOS uses 'padding'
        - Android uses 'height' (or undefined if it still jumps weirdly)
      */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0} 
      >
        
        {/* Header */}
        <View className="flex-row justify-between items-center py-3 px-5 border-b border-white/10 bg-black z-10">
          <TouchableOpacity onPress={toggleSidebar} className="p-2 -ml-2">
            <Menu size={24} color="white" />
          </TouchableOpacity>
          
          <View className="items-center">
            <Text className="text-white font-bold text-lg tracking-wider">INSIGHT</Text>
            <View className="flex-row items-center mt-1">
              <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <Text className="text-white/50 text-[10px] uppercase">{status}</Text>
            </View>
          </View>
          
          {/* Dev trigger placeholder to balance flex-row */}
          <TouchableOpacity onPress={simulateBurst} className="p-2 -mr-2">
             <Cpu size={20} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Scrollable Chat Area */}
        <View className="flex-1 px-5 pt-4">
          
          {/* Hardware Visual Context (Stays at the top of the chat) */}
          {images.length > 0 && (
            <View className="mb-6">
                <Text className="text-white/50 text-[10px] uppercase mb-2">Visual Context</Text>
                <View className="flex-row">
                    {images.map((img, i) => (
                        <Image key={i} source={{ uri: img }} className="w-20 h-20 rounded-lg bg-white/10 mr-2" />
                    ))}
                </View>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            
            // Render the *active* streaming response at the bottom of the list
            ListFooterComponent={() => (
              <View>
                {/* Active User Voice Transcript */}
                {userTranscript ? (
                  <View className="mb-4 max-w-[85%] px-4 py-3 bg-white/10 self-end rounded-2xl rounded-tr-sm opacity-70">
                    <Text className="text-white text-base italic">"{userTranscript}"</Text>
                  </View>
                ) : null}

                {/* Active AI Streaming Response */}
                {responseText ? (
                  <View className="mb-4 max-w-[95%] px-5 py-4 bg-primary/10 self-start rounded-2xl rounded-tl-sm border border-primary/20">
                     <View className="flex-row items-center gap-2 mb-2">
                        <Cpu size={14} color="#06b6d4" />
                        <Text className="text-primary text-[10px] uppercase font-bold">Insight is typing...</Text>
                    </View>
                    <Text className="text-white text-lg leading-7 font-medium">{responseText}</Text>
                    
                    {/* Google Search Sources (Appended when done) */}
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
                ) : null}
              </View>
            )}
          />
        </View>

        {/* Text Input Area */}
        <View className="px-4 py-3 bg-black border-t border-white/10 flex-row items-end">
          <TextInput
            className="flex-1 bg-white/10 text-white rounded-3xl px-5 pt-3 pb-3 mr-3 max-h-32 text-base"
            placeholder="Ask Insight..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity 
            onPress={handleSendText}
            disabled={!inputText.trim()}
            className={`p-3 mb-0.5 rounded-full justify-center items-center ${
              inputText.trim() ? 'bg-primary' : 'bg-white/10'
            }`}
          >
            <Send size={20} color={inputText.trim() ? "black" : "#64748b"} />
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* --- Sidebar Overlay --- */}
      {isSidebarOpen && (
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={toggleSidebar} 
          className="absolute inset-0 bg-black/60 z-20"
        />
      )}
      
      {/* --- Sliding Sidebar --- */}
      <Animated.View 
        style={{ transform: [{ translateX: slideAnim }] }}
        className="absolute top-0 bottom-0 left-0 w-3/4 max-w-[300px] bg-zinc-950 border-r border-white/10 z-30 pt-16 px-5 shadow-2xl"
      >
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-white text-xl font-bold tracking-widest">HISTORY</Text>
          <TouchableOpacity onPress={toggleSidebar} className="p-1">
            <X size={24} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity className="flex-row items-center justify-center bg-primary/20 border border-primary/50 p-4 rounded-xl mb-8">
          <Plus size={20} color="#06b6d4" />
          <Text className="text-primary ml-2 font-bold text-sm uppercase">New Chat</Text>
        </TouchableOpacity>

        <Text className="text-white/30 text-xs font-bold mb-4 uppercase tracking-wider">Previous</Text>
        {/* Placeholder for actual history mapping */}
        <TouchableOpacity className="py-4 border-b border-white/5 flex-row items-center">
            <Text className="text-white/70 text-sm font-medium">How do I wire the ESP32?</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-4 border-b border-white/5 flex-row items-center">
            <Text className="text-white/70 text-sm font-medium">Read this calculus equation</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}