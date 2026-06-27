import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType =
  | 'cert_expiry'
  | 'compliance_due'
  | 'compliance_overdue'
  | 'incident'
  | 'custom'
  | 'system';

type NotifRow = {
  id: string;
  recipient_id: string;
  subject: string | null;
  type: string | null;
  sent_at: string | null;
  read: boolean;
  recipient_email: string | null;
  created_at: string;
};

type DateGroup = {
  label: string;
  data: NotifRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const relTime = (ts: string): string => {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return d.toLocaleDateString();
};

const startOfDay = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const groupByDate = (items: NotifRow[]): DateGroup[] => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  const groups: Record<string, NotifRow[]> = {
    Today: [],
    Yesterday: [],
    'Earlier this week': [],
    Older: [],
  };

  for (const item of items) {
    const ts = startOfDay(new Date(item.created_at));
    if (ts >= todayStart) {
      groups['Today'].push(item);
    } else if (ts >= yesterdayStart) {
      groups['Yesterday'].push(item);
    } else if (ts >= weekStart) {
      groups['Earlier this week'].push(item);
    } else {
      groups['Older'].push(item);
    }
  }

  return Object.entries(groups)
    .filter(([, data]) => data.length > 0)
    .map(([label, data]) => ({ label, data }));
};

type IconConfig = {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
};

const ICON_CONFIG: Record<NotifType, IconConfig> = {
  cert_expiry:         { name: 'ribbon-outline',            color: '#F59E0B' },
  compliance_due:      { name: 'calendar-outline',          color: '#F59E0B' },
  compliance_overdue:  { name: 'alert-circle-outline',      color: colors.red },
  incident:            { name: 'warning-outline',           color: colors.red },
  custom:              { name: 'mail-outline',              color: colors.greenMd },
  system:              { name: 'information-circle-outline',color: colors.muted },
};

const getIconConfig = (type: string | null): IconConfig =>
  ICON_CONFIG[(type as NotifType) ?? 'system'] ?? ICON_CONFIG.system;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const navigation = useNavigation();

  const [items,      setItems]      = useState<NotifRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking,    setMarking]    = useState(false);

  const unreadCount = items.filter(n => !n.read).length;

  // Header: "Mark all read" button + unread badge
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        unreadCount > 0 ? (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            disabled={marking}
          >
            <Text style={s.markAll}>{marking ? 'Marking…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, unreadCount, marking]);

  // ─── Data loading ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); setRefreshing(false); return; }

      const { data, error } = await supabase
        .from('notification_log')
        .select('id, recipient_id, subject, type, sent_at, read, recipient_email, created_at')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setItems((data as NotifRow[]) ?? []);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setItems(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    const { error } = await supabase
      .from('notification_log')
      .update({ read: true })
      .eq('id', id);
    if (error) {
      // Revert on failure
      setItems(prev =>
        prev.map(n => (n.id === id ? { ...n, read: false } : n))
      );
      Alert.alert('Error', error.message);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = items.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    setMarking(true);
    // Optimistic update
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    const { error } = await supabase
      .from('notification_log')
      .update({ read: true })
      .in('id', unreadIds);
    setMarking(false);
    if (error) {
      // Revert on failure
      setItems(prev =>
        prev.map(n => (unreadIds.includes(n.id) ? { ...n, read: false } : n))
      );
      Alert.alert('Error', error.message);
    }
  }, [items]);

  const handlePress = useCallback((item: NotifRow) => {
    if (!item.read) {
      markRead(item.id);
    }
  }, [markRead]);

  // ─── Rendering ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.greenMd} size="large" />
      </View>
    );
  }

  const groups = groupByDate(items);

  // Flatten groups into FlatList data with section headers
  type ListItem =
    | { kind: 'header'; label: string; key: string }
    | { kind: 'notif'; item: NotifRow; key: string };

  const flatData: ListItem[] = [];
  for (const group of groups) {
    flatData.push({ kind: 'header', label: group.label, key: `hdr-${group.label}` });
    for (const notif of group.data) {
      flatData.push({ kind: 'notif', item: notif, key: notif.id });
    }
  }

  return (
    <View style={s.container}>
      {/* Unread count banner */}
      {unreadCount > 0 && (
        <View style={s.banner}>
          <View style={s.badge}>
            <Text style={s.badgeText}>{unreadCount}</Text>
          </View>
          <Text style={s.bannerText}>
            {unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`}
          </Text>
        </View>
      )}

      <FlatList
        data={flatData}
        keyExtractor={item => item.key}
        style={s.list}
        contentContainerStyle={flatData.length === 0 ? s.emptyContainer : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.greenMd}
          />
        }
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item: listItem, index }) => {
          if (listItem.kind === 'header') {
            return <View style={s.sectionHeader}><Text style={s.sectionHeaderText}>{listItem.label}</Text></View>;
          }

          const { item } = listItem;
          const icon = getIconConfig(item.type);
          const isUnread = !item.read;
          // Determine separator: show if next item is also a notif row
          const nextItem = flatData[index + 1];
          const showSep = nextItem?.kind === 'notif';

          return (
            <>
              <TouchableOpacity
                style={[s.row, isUnread && s.rowUnread]}
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
              >
                {/* Type icon */}
                <View style={[s.iconWrap, { backgroundColor: icon.color + '18' }]}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>

                {/* Content */}
                <View style={s.rowBody}>
                  <Text
                    style={[s.subject, isUnread && s.subjectUnread]}
                    numberOfLines={2}
                  >
                    {item.subject ?? 'Notification'}
                  </Text>
                  <Text style={s.time}>
                    {relTime(item.sent_at ?? item.created_at)}
                  </Text>
                </View>

                {/* Unread dot */}
                {isUnread && <View style={s.unreadDot} />}
              </TouchableOpacity>
              {showSep && <View style={s.sep} />}
            </>
          );
        }}
      />
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={s.emptyWrap}>
      <Ionicons name="notifications-off-outline" size={52} color={colors.border} />
      <Text style={s.emptyText}>No notifications</Text>
      <Text style={s.emptyHint}>You're all caught up</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  list: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.border,
  },

  // Unread count banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badge: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bannerText: {
    fontSize: 13,
    color: colors.muted,
  },

  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundColor: colors.bg,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Notification row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowUnread: {
    backgroundColor: '#EFF6FF',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  subject: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 19,
  },
  subjectUnread: {
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
    color: colors.muted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 10,
    flexShrink: 0,
  },
  sep: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 66,
  },

  // Header button
  markAll: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.cream,
  },
});
