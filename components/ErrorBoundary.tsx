/**
 * Sahifa "sinib" qolganda oq ekran o'rniga tushunarli xabar ko'rsatadi va xatoni serverga yuboradi.
 *
 * Ikki joyda turadi (App.tsx): sahifalar atrofida — menyu joyida qoladi, boshqa bo'limga o'tsa
 * bo'ladi; va butun ilova atrofida — sarlavhaning o'zi sinsa ham ekran bo'sh qolmaydi.
 * Boshqa manzilga o'tilganda (yoki shu bo'lim menyudan qayta bosilganda) xabar yo'qoladi va
 * sahifa qaytadan chiziladi.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, LifeBuoy, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { openSupport } from '../services/support';
import { reportClientError } from '../utils/errorReporter';

interface ErrorBoundaryProps {
  /** Butun ekranni egallaydi (ilova darajasida); aks holda — sahifa o'rnidagi karta */
  fullScreen?: boolean;
  children: React.ReactNode;
}

const ErrorFallback: React.FC<{ fullScreen?: boolean }> = ({ fullScreen }) => {
  const { t } = useLanguage();
  const wrapper = fullScreen
    ? 'min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4'
    : 'flex justify-center py-10 sm:py-16';
  return (
    <div role="alert" data-error-fallback className={wrapper}>
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('auto.Bu sahifada xatolik yuz berdi')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {t("auto.Sahifani yangilab ko'ring. Yana takrorlansa — yordamga yozing.")}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            <RefreshCw className="h-4 w-4" />
            {t('auto.Sahifani yangilash')}
          </button>
          <button
            type="button"
            onClick={() => { void openSupport(); }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <LifeBuoy className="h-4 w-4" />
            {t('auto.Yordam')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface BoundaryProps extends ErrorBoundaryProps {
  /** O'zgarsa — xato holati tozalanadi */
  resetKey: string;
}

interface BoundaryState {
  failed: boolean;
}

// React'da xatoni ushlash faqat klass komponentda bor
class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    reportClientError(error, 'boundary', info?.componentStack);
  }

  componentDidUpdate(prevProps: BoundaryProps, prevState: BoundaryState): void {
    // prevState.failed: xato aynan shu o'tishda chiqqan bo'lsa (yangi sahifa ochilishi bilan sindi) —
    // tozalanmaydi, aks holda singan sahifa darhol yana bir marta chizilardi
    if (this.state.failed && prevState.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): React.ReactNode {
    return this.state.failed ? <ErrorFallback fullScreen={this.props.fullScreen} /> : this.props.children;
  }
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ fullScreen, children }) => {
  const location = useLocation();
  return <Boundary resetKey={location.key} fullScreen={fullScreen}>{children}</Boundary>;
};
