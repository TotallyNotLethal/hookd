'use client';
import { app } from '@/lib/firebaseClient';
import { ensureUserProfile, updateUserProfile } from '@/lib/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { subscribeToUser, subscribeToUserCatches, updateUserProfile } from '@/lib/firestore';


export default function Page() {
  const router = useRouter();
  async function google() {
    const auth = getAuth(app);
    const res = await signInWithPopup(auth, new GoogleAuthProvider());
    await ensureUserProfile(res.user);
    router.push('/feed');
  }
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="text-3xl font-semibold mb-2">Welcome</h1>
        <p className="text-white/70 mb-6">Sign in to continue to Hook&apos;d</p>
        <button onClick={google} className="btn-primary w-full">Continue with Google</button>
      </div>
    </main>
  );
}
