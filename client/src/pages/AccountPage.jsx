import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAccount } from '../lib/account';
import './AccountPage.css';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function LogInForm({ onForgot }) {
  const { setAccount } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await postJson('/api/auth/login', { name, password });
      setAccount(account);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit}>
      <label>
        Minecraft username
        <input type="text" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="account-form__error" role="alert">{error}</p>}
      <button type="submit" className="account-form__submit" disabled={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <button type="button" className="account-form__link" onClick={onForgot}>Forgot password?</button>
    </form>
  );
}

// The verify server runs on the same domain as the site, on Minecraft's default port.
function ServerAddress() {
  const address = window.location.hostname;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is still there to select by hand.
    }
  };

  return (
    <div className="account-address">
      <code>{address}</code>
      <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

function LinkAccountForm({ resetting }) {
  const { setAccount } = useAccount();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await postJson('/api/auth/claim', { code, password });
      setAccount(account);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div>
      {resetting ? (
        <p className="account-note">
          To set a new password, link your account again. You'll get logged out on other devices.
        </p>
      ) : (
        <p className="account-note">
          Linking verifies you own your Minecraft account. Verified players get a ✓ next to their name, and their
          comments skip the approval queue.
        </p>
      )}

      <ol className="account-steps">
        <li>
          In Minecraft (Java 1.20.4+), go to <strong>Multiplayer → Add Server</strong> and enter this address:
          <ServerAddress />
        </li>
        <li>Join the server to get a 5-character code.</li>
        <li>
          Enter the code below and choose a password.
          <form className="account-form" onSubmit={submit}>
            <label>
              Code
              <input type="text" className="account-form__code" autoComplete="one-time-code" autoCapitalize="characters"
                spellCheck={false} maxLength={5} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                required />
            </label>
            <label>
              {resetting ? 'New password' : 'Create Password'}
              <input type="password" autoComplete="new-password" minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} required />
              <span className="account-form__hint">At least 8 characters.</span>
            </label>
            {error && <p className="account-form__error" role="alert">{error}</p>}
            <button type="submit" className="account-form__submit" disabled={busy}>
              {busy ? 'Linking…' : resetting ? 'Set new password' : 'Link account'}
            </button>
          </form>
        </li>
      </ol>
    </div>
  );
}

const TABS = [
  { id: 'login', label: 'Log In' },
  { id: 'link', label: 'Link New Account' },
];

function AccountPage() {
  const { account } = useAccount();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'link' ? 'link' : 'login';
  const [resetting, setResetting] = useState(false);

  const showTab = (id) => {
    setResetting(false);
    setParams(id === 'link' ? { tab: 'link' } : {}, { replace: true });
  };
  const forgotPassword = () => {
    setParams({ tab: 'link' }, { replace: true });
    setResetting(true);
  };

  return (
    <div>
      <Navbar />
      <main className="account-page">
        {account === undefined ? null : account ? (
          // The logged-in view comes in step 2.4c.
          <p>You're logged in as <strong>{account.name}</strong>.</p>
        ) : (
          <>
            <h2>Account</h2>
            <div className="account-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => showTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'login' ? <LogInForm onForgot={forgotPassword} /> : <LinkAccountForm resetting={resetting} />}
          </>
        )}
      </main>
    </div>
  );
}

export default AccountPage;
