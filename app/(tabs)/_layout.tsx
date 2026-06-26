import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IoniconsName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle:      { backgroundColor: colors.greenDk },
        headerTintColor:  colors.cream,
        headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5 },
        tabBarStyle: {
          backgroundColor: colors.greenDk,
          borderTopColor:  colors.greenMd,
          borderTopWidth:  1,
        },
        tabBarActiveTintColor:   colors.cream,
        tabBarInactiveTintColor: colors.greenLt,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <TabIcon name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: 'Training',
          tabBarIcon: ({ color, size }) => <TabIcon name="school-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ color, size }) => <TabIcon name="warning-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <TabIcon name="menu-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
