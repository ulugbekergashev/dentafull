import React, { useState } from 'react';
import { Button, Input, Card } from '../components/Common';
import { UserRole } from '../types';
import { AlertCircle, Lock, User } from 'lucide-react';
import { api } from '../services/api';

interface SignInProps {
  onLogin: (role: UserRole, name: string, clinicId?: string) => void;
}

export const SignIn: React.FC<SignInProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.auth.login(username, password);

      if (response.success && response.role && response.name) {
        // Save to localStorage if remember me is checked
        const authData = {
          role: response.role,
          name: response.name,
          clinicId: response.clinicId,
          username: username,
          token: response.token
        };

        if (rememberMe) {
          localStorage.setItem('dentalflow_auth', JSON.stringify(authData));
        } else {
          sessionStorage.setItem('dentalflow_auth', JSON.stringify(authData));
        }

        onLogin(response.role as UserRole, response.name, response.clinicId);
      } else {
        setError(response.error || 'Login yoki parol noto\'g\'ri');
      }
    } catch (err) {
      setError('Tizimga kirishda xatolik yuz berdi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4 transform rotate-3">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">DentaCRM</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Klinika boshqaruv tizimiga kirish</p>
        </div>

        <Card className="p-8 shadow-xl border-t-4 border-t-blue-600">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400 text-sm animate-fade-in">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Login</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  className="pl-10 block w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  placeholder="Foydalanuvchi nomi"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Parol</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  className="pl-10 block w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                Meni eslab qol
              </label>
            </div>

            <Button
              type="submit"
              className="w-full py-2.5 text-base shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all"
              disabled={isLoading}
            >
              {isLoading ? 'Tekshirilmoqda...' : 'Tizimga kirish'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-400">
              Muammo yuzaga kelsa, texnik yordamga murojaat qiling: <br />
              <span className="font-medium text-blue-600">+998 90 824 29 92</span>
            </p>
          </div>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; {new Date().getFullYear()} DentaCRM. Barcha huquqlar himoyalangan.
        </p>
      </div>
    </div>
  );
};
