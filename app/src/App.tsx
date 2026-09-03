import { type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import QuotePage from './pages/QuotePage'
import SavedQuotesPage from './pages/SavedQuotesPage'
import { useProject } from '@/lib/ProjectContext'
import { goToCatalystLogin } from '@/lib/catalystAuth'
import { SectionRequiredProvider } from '@/lib/SectionRequiredContext'

function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, currentUserLoading, refreshCurrentUser } = useProject();
  const isAllowed = !!currentUser?.authenticated && (currentUser.appAccessAllowed ?? currentUser.domainAllowed);

  if (currentUserLoading && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
          <div className="text-sm font-semibold text-zinc-950">Checking access...</div>
          <div className="mt-1 text-xs text-zinc-500">Confirming your JDI Pricing login.</div>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    const wrongDomain = currentUser?.authenticated && !currentUser.domainAllowed;
    const pdfOnly = currentUser?.authenticated && currentUser.domainAllowed && currentUser.appAccessAllowed === false;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8">
        <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="text-base font-semibold text-zinc-950">Sign in to JDI Pricing</div>
            <div className="mt-1 text-sm text-zinc-500">
              {wrongDomain
                ? 'This account is not allowed. Use an invited @jdidistribution.com account.'
                : pdfOnly
                  ? 'This account can download quote PDFs from CRM, but it is not invited to use the pricing tool.'
                  : 'Only invited JDI Distribution users can access this app.'}
            </div>
          </div>
          <div className="px-5 py-8">
            <button
              type="button"
              onClick={goToCatalystLogin}
              className="h-11 w-full rounded-lg bg-[#e8473f] px-4 text-sm font-bold text-white hover:bg-[#d43f37]"
            >
              Sign In
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">
              You will be sent to Catalyst's secure hosted login page.
            </p>
          </div>
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">Access is restricted to invited users.</div>
            <button
              type="button"
              onClick={() => void refreshCurrentUser()}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-gray-50"
            >
              Check Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <SectionRequiredProvider>{children}</SectionRequiredProvider>;
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quote" element={<QuotePage />} />
        <Route path="/saved-quotes" element={<SavedQuotesPage />} />
      </Routes>
    </AuthGate>
  )
}
