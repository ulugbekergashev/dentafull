import React, { useState } from 'react';
import { Modal, Button } from './Common';
import { MessageSquare, AlertCircle, Info, Send, User, Clock, Wallet } from 'lucide-react';

interface BulkSmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  title: string;
  defaultMessage: string;
  placeholders: Array<{ key: string; label: string; icon: any }>;
  recipientCount: number;
  loading?: boolean;
}

export const BulkSmsModal: React.FC<BulkSmsModalProps> = ({
  isOpen,
  onClose,
  onSend,
  title,
  defaultMessage,
  placeholders,
  recipientCount,
  loading = false,
}) => {
  const [message, setMessage] = useState(defaultMessage);

  const handleSend = () => {
    onSend(message);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Recipient Info */}
        <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50">
          <div className="p-2 bg-blue-500 rounded-xl text-white">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-900 dark:text-blue-100">{recipientCount} ta qabul qiluvchi</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Xabar barcha tanlangan bemorlarga yuboriladi.</p>
          </div>
        </div>

        {/* Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
              Xabar Matni
            </label>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${message.length > 160 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
              {message.length} ta belgi
            </span>
          </div>
          
          <div className="relative group">
            <textarea
              className="w-full h-40 p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none dark:text-white"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Xabar matnini kiriting..."
            />
            <div className="absolute top-3 right-3 text-gray-300 dark:text-gray-600 group-focus-within:text-blue-500 transition-colors">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Placeholders Guide */}
        <div className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4 text-xs font-black text-gray-400 uppercase tracking-widest">
            <Info className="w-3.5 h-3.5" />
            O'zgaruvchilarni ishlating
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {placeholders.map((p) => (
              <button
                key={p.key}
                onClick={() => setMessage(prev => prev + p.key)}
                className="flex items-center gap-2 p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all text-left group"
              >
                <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <p.icon className="w-3.5 h-3.5" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] font-black text-blue-600 truncate">{p.key}</p>
                  <p className="text-[10px] text-gray-500 truncate">{p.label}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-gray-500 leading-relaxed italic">
            * Kerakli o'zgaruvchini bosish orqali uning kodini matnga qo'shishingiz mumkin. Yuborilganda u bemorning haqiqiy ma'lumotlari bilan almashtiriladi.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={loading || !message.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
          >
            {loading ? 'Yuborilmoqda...' : 'Tasdiqlash va Yuborish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
