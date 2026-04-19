import { Clock, Search, Calendar, ChevronRight } from 'lucide-react-native';
import { FlatList, Text, TouchableOpacity, View, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

export default function MemoriesScreen() {
  const { sessionHistory } = useApp();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const passiveSessions = useMemo(() => {
    return sessionHistory
      .filter(s => s.id.startsWith('passive_'))
      .filter(s => 
        s.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [sessionHistory, searchQuery]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderSession = ({ item }: { item: any }) => (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/memory/[id]', params: { id: item.id } })}
      className="bg-surfaceHighlight mb-4 rounded-2xl p-4 border border-white/5 flex-row items-center"
    >
      {/* Mini Preview or Icon */}
      <View className="w-16 h-16 bg-black rounded-xl overflow-hidden mr-4 items-center justify-center border border-white/10">
        {item.images && item.images.length > 0 ? (
          <Image source={{ uri: item.images[0] }} className="w-full h-full opacity-60" resizeMode="cover" />
        ) : (
          <Clock size={24} color="#64748b" />
        )}
      </View>

      <View className="flex-1">
        <Text className="text-white font-bold text-base mb-1" numberOfLines={1}>
          {item.preview || 'Untitled Memory'}
        </Text>
        <View className="flex-row items-center">
           <Calendar size={12} color="#64748b" />
           <Text className="text-textDim text-xs ml-1 mr-3">{formatDate(item.timestamp)}</Text>
           <Clock size={12} color="#64748b" />
           <Text className="text-textDim text-xs ml-1">{formatTime(item.timestamp)}</Text>
        </View>
      </View>

      <ChevronRight size={20} color="#334155" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-background px-5 pt-5">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-text font-bold text-2xl tracking-tight">Passive Memories</Text>
          <Text className="text-textDim text-sm mt-1">Review your long-term logs</Text>
        </View>
        <TouchableOpacity className="bg-primary/10 p-2 rounded-full">
           <Clock size={20} color="#06b6d4" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View className="bg-surfaceHighlight flex-row items-center px-4 py-3 rounded-2xl mb-6 border border-white/5">
        <Search size={18} color="#64748b" />
        <TextInput 
          placeholder="Search memories..."
          placeholderTextColor="#64748b"
          className="flex-1 ml-3 text-white"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={passiveSessions}
        keyExtractor={item => item.id}
        renderItem={renderSession}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20 opacity-30">
            <Clock size={48} color="#64748b" />
            <Text className="text-white mt-4 text-center italic">
              {searchQuery ? 'No matching memories found.' : 'No passive sessions recorded yet.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
