import { Battery, Eye, Mic, X } from 'lucide-react-native';
import { Image, ScrollView, Text, TouchableOpacity, View, Modal, FlatList, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { images, sessionHistory, loadChat } = useApp();
  const router = useRouter();
  
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const allGalleryImages = useMemo(() => {
    const list: { uri: string, sessionId: string | 'active' }[] = [];
    const seenUris = new Set<string>();
    
    const reversedHistory = [...sessionHistory].reverse();
    reversedHistory.forEach(session => {
      if (session.images) {
        session.images.forEach(uri => {
          if (!seenUris.has(uri)) {
            list.push({ uri, sessionId: session.id });
            seenUris.add(uri);
          }
        });
      }
    });
    
    images.forEach(uri => {
      if (!seenUris.has(uri)) {
        list.push({ uri, sessionId: 'active' });
        seenUris.add(uri);
      }
    });
    
    return list.reverse();
  }, [images, sessionHistory]);

  const latestImage = allGalleryImages.length > 0 ? allGalleryImages[0].uri : null;

  const numColumns = 3;
  const imageSize = (Dimensions.get('window').width - 40 - (10 * (numColumns - 1))) / numColumns;

  const handleImageClick = (sessionId: string | 'active') => {
    setIsGalleryOpen(false);
    if (sessionId !== 'active') {
      loadChat(sessionId);
    }
    router.push('/(tabs)/active');
  };

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
        <TouchableOpacity 
            activeOpacity={latestImage ? 0.8 : 1}
            onPress={() => latestImage && setIsGalleryOpen(true)}
            className="bg-surfaceHighlight p-4 rounded-2xl mb-6 border border-white/5"
        >
            <Text className="text-textDim text-xs uppercase tracking-wider mb-3">Last Processed Image</Text>
            <View className="h-40 bg-black rounded-xl w-full items-center justify-center overflow-hidden">
                {latestImage ? (
                  <Image 
                      source={{ uri: latestImage }} 
                      className="w-full h-full opacity-80"
                      resizeMode="cover"
                  />
                ) : (
                  <Text className="text-white/30 text-sm italic">No images captured yet.</Text>
                )}
                {latestImage && (
                  <View className="absolute bottom-0 left-0 right-0 p-3 bg-black/60 backdrop-blur-md">
                      <Text className="text-white text-xs">Tap to view gallery</Text>
                  </View>
                )}
            </View>
        </TouchableOpacity>

      </ScrollView>

      {/* Gallery Modal */}
      <Modal visible={isGalleryOpen} transparent={true} animationType="slide" onRequestClose={() => setIsGalleryOpen(false)}>
        <View className="flex-1 bg-black/95 pt-12 px-5">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-xl font-bold tracking-widest">GALLERY</Text>
              <TouchableOpacity onPress={() => setIsGalleryOpen(false)} className="p-2 bg-white/10 rounded-full">
                <X size={20} color="white" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={allGalleryImages}
              numColumns={numColumns}
              keyExtractor={(item, index) => item.uri + index}
              columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  activeOpacity={0.8} 
                  onPress={() => handleImageClick(item.sessionId)}
                >
                  <Image 
                    source={{ uri: item.uri }} 
                    style={{ width: imageSize, height: imageSize }} 
                    className="rounded-lg bg-white/5"
                    resizeMode="cover" 
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text className="text-white/40 italic text-center mt-10">No image history found.</Text>}
            />
        </View>
      </Modal>

    </SafeAreaView>
  );
}