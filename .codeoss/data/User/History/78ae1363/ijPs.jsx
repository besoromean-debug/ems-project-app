import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lockout, setLockout] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkLockout = setInterval(() => {
      if (lockout && lockout < Date.now()) {
        setLockout(null);
        setError('');
      }
    }, 1000);
    return () => clearInterval(checkLockout);
  }, [lockout]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const userRef = doc(db, "users", email.replace('.', '_'));
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.lockout_until && data.lockout_until.toMillis() > Date.now()) {
        setLockout(data.lockout_until.toMillis());
        return;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (userSnap.exists()) {
        await updateDoc(userRef, { failed_attempts: 0, lockout_until: null });
      }
      window.location.href = '/dashboard';
    } catch (err) {
      let currentAttempts = (userSnap.exists() ? userSnap.data().failed_attempts : 0) + 1;
      setAttempts(currentAttempts);

      if (currentAttempts >= 3) {
        const lockoutTime = Date.now() + 15 * 60 * 1000;
        await setDoc(userRef, { 
          failed_attempts: currentAttempts, 
          lockout_until: new Date(lockoutTime) 
        }, { merge: true });
        setLockout(lockoutTime);
        setError("Account locked. Walang attempts na natitira.");
      } else {
        await setDoc(userRef, { failed_attempts: currentAttempts }, { merge: true });
        setError(`Maling credentials. Attempts left: ${3 - currentAttempts}/3`);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-center mb-6">EMS Login</h2>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            disabled={!!lockout}
            className={`w-full p-3 rounded-lg text-white ${lockout ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {lockout ? `Locked (Wait ${Math.ceil((lockout - Date.now()) / 1000)}s)` : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default Login;
