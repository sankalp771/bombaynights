import { redirect } from 'next/navigation';
import { currentAdminEmail } from '@/lib/adminAuth';
import { LoginForm } from '@/components/admin/LoginForm';
import { Wordmark } from '@/components/Wordmark';

export default async function AdminLoginPage() {
  if (await currentAdminEmail()) redirect('/admin/queue');

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center gap-8">
      <div className="text-center">
        <Wordmark />
        <p className="text-cream-muted mt-3 text-sm">
          Owner access only. Everyone else browses and submits without an account — that is the
          whole point.
        </p>
      </div>

      <LoginForm />
    </main>
  );
}
