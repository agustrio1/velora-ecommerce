import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { AccountNav } from '../../components/account/AccountNav';
import { Button, Input, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { cloudflareEnv } from '../../services/cloudflare.server';
import { requireSession } from '../../services/session.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireSession(request, cloudflareEnv(context));
  return null;
}

interface ChatMessage {
  id: string;
  sender: 'customer' | 'admin';
  senderName: string | null;
  body: string;
  createdAt: string;
  readByOther: boolean;
}

interface ThreadView {
  chatId: string;
  open: boolean;
  subject: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  realtimeConfigured: boolean;
  messages: ChatMessage[];
}

/**
 * Customer live-chat (DOC section 10). Messages are persisted to Firebase RTDB by
 * the Worker (clients never write directly), so this view reads the thread through
 * the API and refreshes on a short poll — mirroring the admin inbox. Sending routes
 * through /account/chat which enforces ownership, open status and rate limits.
 */
export function SupportChatPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const thread = useQuery<ThreadView>({
    queryKey: ['account', 'chat'],
    queryFn: () => api.get<ThreadView>('/account/chat', undefined, { anonymous: true }),
    refetchInterval: 8_000,
    retry: 0,
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [thread.data?.messages.length]);

  // Surface admin replies as read once the customer is looking at the thread.
  useEffect(() => {
    const hasUnread = (thread.data?.messages ?? []).some((m) => m.sender === 'admin' && !m.readByOther);
    if (hasUnread) void api.post('/account/chat/read').catch(() => undefined);
  }, [thread.data]);

  const send = useMutation({
    mutationFn: () => api.post<ThreadView>('/account/chat', { body: body.trim() }),
    onSuccess: (data) => {
      setBody('');
      qc.setQueryData(['account', 'chat'], data);
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal mengirim pesan', 'error'),
  });

  const messages = thread.data?.messages ?? [];
  const canSend = Boolean(thread.data?.realtimeConfigured && thread.data?.open);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl sm:text-3xl">Bantuan langsung</h1>
      <AccountNav current="chat" />

      {thread.isLoading && !thread.data ? (
        <Spinner label="Memuat percakapan…" />
      ) : thread.isError ? (
        <p className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Layanan chat sedang tidak tersedia. Coba muat ulang halaman, atau hubungi WhatsApp toko.
        </p>
      ) : !thread.data?.realtimeConfigured ? (
        <p className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Layanan chat belum aktif. Silakan hubungi WhatsApp toko untuk dibantu tim kami.
        </p>
      ) : (
        <div className="flex h-[68vh] flex-col border border-line bg-surface">
          <div className="border-b border-line px-4 py-3">
            <div className="font-medium">Konsultasi pelanggan VELORA</div>
            <div className="text-xs text-muted">
              {thread.data.open ? 'Konsultan siap membantu' : 'Sesi ditutup — buka kembali dengan mengirim pesan baru'}
            </div>
          </div>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-canvas p-4">
            {messages.map((m) => {
              const mine = m.sender === 'customer';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-(--radius-card) border px-3 py-2 text-sm ${
                      mine ? 'border-accent/30 bg-accent-ink' : 'border-line bg-surface'
                    }`}
                  >
                    <div className={`mb-0.5 text-xs ${mine ? 'text-accent' : 'text-muted'}`}>
                      {m.senderName ?? (mine ? 'Anda' : 'Admin VELORA')}
                    </div>
                    <div className="whitespace-pre-wrap text-ink">{m.body}</div>
                    <div className="mt-1 text-[10px] text-muted">
                      {dateTime(m.createdAt)}
                      {mine ? (m.readByOther ? ' • terbaca' : ' • terkirim') : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {!messages.length ? (
              <p className="py-8 text-center text-sm text-muted">Belum ada pesan. Mulai percakapan di bawah.</p>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis pesan…"
              maxLength={2000}
              disabled={!canSend}
            />
            <Button type="submit" loading={send.isPending} disabled={!body.trim() || !canSend}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {!thread.data.open ? (
            <p className="px-4 pb-3 text-xs text-muted">Sesi ditutup. Kirim pesan untuk membukanya kembali.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default SupportChatPage;
