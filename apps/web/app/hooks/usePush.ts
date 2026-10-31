import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { onForegroundPush, pushConfigurable, registerPushToken } from '../lib/firebase';

/**
 * Wires the browser to FCM (DOC sections 11 / B): request permission, mint a
 * device token and register it against the signed-in account. Registration is
 * idempotent server-side (ON CONFLICT(token)), so it is safe to re-run per login.
 *
 * We never prompt unsolicited: a token is registered silently only when the
 * visitor has already granted Notification permission. `enable()` is exposed so a
 * UI affordance (account profile) can ask with an explicit user gesture, matching
 * browser autoplay/permission policies. Everything degrades to a no-op when FCM
 * isn't configured, so the store keeps working without push.
 */
export interface PushState {
  supported: boolean;
  permission: NotificationPermission;
  registered: boolean;
  enable: () => Promise<void>;
}

export function usePushNotification(signedIn: boolean): PushState {
  const toast = useToast();
  const qc = useQueryClient();
  const [registered, setRegistered] = useState(false);
  const supported = pushConfigurable();
  const permission: NotificationPermission =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  const busy = useRef(false);

  const enroll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const token = await registerPushToken();
      if (!token) return;
      await api.post('/account/devices', { token, platform: 'web' });
      setRegistered(true);
    } catch {
      /* registration failures are non-fatal; the app runs fully without push */
    } finally {
      busy.current = false;
    }
  }, []);

  // Auto-enroll returning users who already granted permission (no prompt).
  useEffect(() => {
    if (signedIn && supported && Notification.permission === 'granted') void enroll();
  }, [signedIn, supported, enroll]);

  // Foreground pushes surface as an in-app toast and refresh the notification bell.
  useEffect(() => {
    if (!supported) return;
    return onForegroundPush((payload) => {
      const title = payload.notification?.title ?? 'VELORA';
      const body = payload.notification?.body ?? '';
      toast.push(body ? `${title}: ${body}` : title, 'info');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [supported, toast, qc]);

  const enable = useCallback(async () => {
    if (!supported) {
      toast.push('Notifikasi tidak didukung di browser ini.', 'error');
      return;
    }
    await enroll();
    if (Notification.permission !== 'granted') {
      toast.push('Izin notifikasi belum diizinkan.', 'error');
    }
  }, [supported, enroll, toast]);

  return { supported, permission, registered, enable };
}
