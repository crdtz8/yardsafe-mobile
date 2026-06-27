import { Stack } from 'expo-router';
import { TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { signOut } from '@/lib/auth';

function SignOutBtn() {
  const handle = () =>
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  return (
    <TouchableOpacity onPress={handle} style={{ paddingHorizontal: 4 }}>
      <Ionicons name="log-out-outline" size={22} color={colors.cream} />
    </TouchableOpacity>
  );
}

const baseOptions = {
  headerStyle:        { backgroundColor: colors.greenDk },
  headerTintColor:    colors.cream,
  headerTitleStyle:   { fontWeight: '700' as const, letterSpacing: 0.5 },
  headerBackTitle:    'Home',
};

export default function AppLayout() {
  return (
    <Stack screenOptions={baseOptions}>
      <Stack.Screen name="index"          options={{ headerShown: false }} />
      <Stack.Screen name="training"       options={{ title: 'Training' }} />
      <Stack.Screen name="incidents"      options={{ title: 'Incidents' }} />
      <Stack.Screen name="employees"      options={{ title: 'Employees' }} />
      <Stack.Screen name="library"        options={{ title: 'Training Library' }} />
      <Stack.Screen name="inspections"    options={{ title: 'Safety Inspections' }} />
      <Stack.Screen name="corrective"     options={{ title: 'Corrective Actions' }} />
      <Stack.Screen name="certifications" options={{ title: 'Certifications' }} />
      <Stack.Screen name="documents"      options={{ title: 'Documents' }} />
      <Stack.Screen name="equipment"         options={{ title: 'Equipment' }} />
      <Stack.Screen name="my-trainings"     options={{ title: 'My Trainings' }} />
      <Stack.Screen name="my-history"       options={{ title: 'My History' }} />
      <Stack.Screen name="inspection/[id]"  options={{ title: 'Inspection' }} />
      <Stack.Screen name="permits"         options={{ title: 'Safety Permits' }} />
      <Stack.Screen name="environmental"   options={{ title: 'Environmental' }} />
      <Stack.Screen name="sds"             options={{ title: 'SDS Library' }} />
      <Stack.Screen name="notifications"   options={{ title: 'Notifications' }} />
    </Stack>
  );
}
