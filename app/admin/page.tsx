import { redirect } from 'next/navigation';
import { currentAdminEmail } from '@/lib/adminAuth';

export default async function AdminIndexPage() {
  const email = await currentAdminEmail();
  redirect(email ? '/admin/queue' : '/admin/login');
}
