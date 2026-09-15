import { useState } from 'react';
import { setAdminToken } from '../lib/adminAuth';

function AdminLogin({ onLogin }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setAdminToken(value.trim());
    onLogin();
  };

  return (
    <form onSubmit={handleSubmit} className="admin-login">
      <h2>wazapppp</h2>
      <input
        type="password"
        placeholder="Admin token"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit">Log in</button>
    </form>
  );
}

export default AdminLogin;