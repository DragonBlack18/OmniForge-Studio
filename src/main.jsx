import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import './chrome.css';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <main style={{ padding: 48, color: '#fff', fontFamily: 'sans-serif' }}>
        <h1>Falha na interface</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>Recarregar interface</button>
      </main>
    );
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
