import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';
import { Button, Input } from './ui';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>('/newsletter', { email, source: 'storefront' });
      toast.push(res.message, 'success');
      setEmail('');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Langganan gagal, coba lagi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nama@email.com"
        className="flex-1"
      />
      <Button type="submit" loading={busy}>
        Berlangganan
      </Button>
    </form>
  );
}
