import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatThreadSummary } from '@velora/shared';
import { clsx } from 'clsx';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Input, Spinner } from '../../components/ui/form';
import { Card, EmptyState } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { AdminThreadsResponse } from '../../lib/api-types';
import { dateTime } from '../../lib/format';

interface AdminMessage {
  id: string;
  sender: 'customer' | 'admin';
  senderName: string | null;
  body: string;
  createdAt: string;
}

export function AdminChat() {
  const [status, setStatus] = useState<'' | 'open' | 'closed'>('open');
  const [activeId, setActiveId] = useState<string | null>(null);

  const threads = useQuery<AdminThreadsResponse>({
    queryKey: ['admin', 'chat', status],
    queryFn: () =>
      api.get<AdminThreadsResponse>('/admin/chat', { status: status || undefined, pageSize: 50 }, { anonymous: true }),
    refetchInterval: 20_000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Chat' }]}
        title="Chat"
        description="Percakapan langsung dengan pelanggan."
        actions={
          status ? (
            <Button variant="ghost" onClick={() => setStatus('')}>
              Tampilkan semua
            </Button>
          ) : undefined
        }
      />

      {threads.data && !threads.data.realtimeConfigured ? (
        <p className="rounded-(--radius-card) border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Realtime Database belum dikonfigurasi, sehingga pesan baru tidak dapat dikirim.
        </p>
      ) : null}

      {activeId ? (
        <ThreadView id={activeId} onBack={() => setActiveId(null)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(['open', 'closed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus((prev) => (prev === s ? '' : s))}
                className={clsx(
                  'rounded-pill border px-3 py-1 text-sm transition-colors',
                  status === s
                    ? 'border-accent bg-accent-ink font-medium text-accent'
                    : 'border-line bg-surface text-muted hover:text-ink',
                )}
              >
                {s === 'open' ? 'Terbuka' : 'Selesai'}
              </button>
            ))}
          </div>

          {threads.isLoading && !threads.data ? (
            <Spinner label="Memuat sesi…" />
          ) : threads.data?.items.length ? (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {threads.data.items.map((t) => (
                  <ThreadRow key={t.chatId} thread={t} onOpen={() => setActiveId(t.chatId)} />
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState
              title="Belum ada sesi"
              body="Percakapan baru dari pelanggan akan muncul di sini."
              action={<MessageSquare className="h-5 w-5 text-muted" />}
            />
          )}
        </>
      )}
    </div>
  );
}

function ThreadRow({ thread, onOpen }: { thread: ChatThreadSummary; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-soft/40"
      >
        <div className="min-w-0">
          <div className="truncate font-medium">{thread.customerName ?? thread.customerEmail}</div>
          <div className="truncate text-xs text-muted">{thread.lastMessage ?? '— mulai percakapan —'}</div>
        </div>
        <div className="shrink-0 text-right">
          {thread.unreadForAdmin > 0 ? (
            <span className="mb-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">
              {thread.unreadForAdmin}
            </span>
          ) : null}
          <div className="text-xs text-muted">{thread.lastMessageAt ? dateTime(thread.lastMessageAt) : ''}</div>
        </div>
      </button>
    </li>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const detail = useQuery<{ thread: ChatThreadSummary; messages: AdminMessage[] }>({
    queryKey: ['admin', 'chat', id],
    queryFn: () =>
      api.get<{ thread: ChatThreadSummary; messages: AdminMessage[] }>(`/admin/chat/${id}`, undefined, {
        anonymous: true,
      }),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [detail.data?.messages.length]);

  const send = useMutation({
    mutationFn: () => api.post(`/admin/chat/${id}/messages`, { body: body.trim() }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['admin', 'chat', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'chat'] });
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal mengirim', 'error'),
  });

  const setStatus = useMutation({
    mutationFn: (next: 'open' | 'closed') => api.patch(`/admin/chat/${id}/status`, { status: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'chat', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'chat'] });
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal memperbarui', 'error'),
  });

  if (detail.isLoading && !detail.data) return <Spinner label="Memuat percakapan…" />;
  const t = detail.data?.thread;
  const messages = detail.data?.messages ?? [];

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Kembali">
            <ArrowLeft />
          </Button>
          <div>
            <div className="font-medium">{t?.customerName ?? t?.customerEmail}</div>
            <div className="text-xs text-muted">{t?.customerEmail}</div>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setStatus.mutate(t?.open ? 'closed' : 'open')}>
          {t?.open ? 'Tutup sesi' : 'Buka kembali'}
        </Button>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-canvas p-4">
        {messages.map((m) => (
          <div key={m.id} className={clsx('flex', m.sender === 'admin' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'max-w-[80%] rounded-(--radius-card) border px-3 py-2 text-sm',
                m.sender === 'admin' ? 'border-accent/30 bg-accent-ink' : 'border-line bg-surface',
              )}
            >
              <div className={clsx('mb-0.5 text-xs', m.sender === 'admin' ? 'text-accent' : 'text-muted')}>
                {m.senderName ?? (m.sender === 'admin' ? 'Admin' : 'Pelanggan')}
              </div>
              <div className="whitespace-pre-wrap text-ink">{m.body}</div>
              <div className="mt-1 text-[10px] text-muted">{dateTime(m.createdAt)}</div>
            </div>
          </div>
        ))}
        {!messages.length ? <p className="py-8 text-center text-sm text-muted">Belum ada pesan.</p> : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) send.mutate();
        }}
        className="flex gap-2 border-t border-line p-3"
      >
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Tulis balasan…"
          maxLength={2000}
          disabled={!t?.open}
        />
        <Button type="submit" loading={send.isPending} disabled={!body.trim() || !t?.open}>
          <Send />
        </Button>
      </form>
      {!t?.open ? <p className="px-4 pb-3 text-xs text-muted">Sesi ditutup. Buka kembali untuk membalas.</p> : null}
    </Card>
  );
}

export default AdminChat;
