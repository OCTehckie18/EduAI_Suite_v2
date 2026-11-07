import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './dark-theme.css';
import './dark-utilities.css';
import { initTheme } from './shared/theme';
import { installAuthFetch } from './shared/installAuthFetch';

// Renew the access token with the refresh token and return to sign-in when the session ends.
installAuthFetch();
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
