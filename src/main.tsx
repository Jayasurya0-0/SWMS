import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { handleMockRequest } from './data/clientDbService';

// Detect if we should use client-side persistent sandbox
let useMock = false;

// If we are on Netlify or GitHub Pages, we activate mock database immediately for a smooth experience
if (typeof window !== 'undefined') {
  const host = window.location.hostname;
  if (host.includes('netlify.app') || host.includes('github.io')) {
    useMock = true;
    console.log("Static Hosting Environment detected. Routing to Client-Side persistent database sandbox.");
  }
}

const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  
  // Detect if this is an API route, even if specified as an absolute or relative URL
  let isApi = false;
  let cleanUrl = url;
  try {
    if (url.startsWith('/api/')) {
      isApi = true;
    } else {
      const parsedUrl = new URL(url, window.location.origin);
      if (parsedUrl.pathname.startsWith('/api/')) {
        isApi = true;
        cleanUrl = parsedUrl.href;
      }
    }
  } catch (err) {
    isApi = url.includes('/api/');
  }

  if (isApi) {
    if (useMock) {
      return handleMockRequest(cleanUrl, init);
    }
    
    // Inject x-session-id header for iframe compatibility
    try {
      const token = localStorage.getItem('swm_session_token');
      if (token) {
        init = init || {};
        const headers = init.headers ? (
          init.headers instanceof Headers 
            ? init.headers 
            : new Headers(init.headers as Record<string, string>)
        ) : new Headers();
        
        headers.set('x-session-id', token);
        init.headers = headers;
      }
    } catch (e) {
      console.warn("Could not inject session header:", e);
    }
    
    try {
      const res = await originalFetch(input, init);
      // Netlify redirects non-existent endpoints to index.html with 200 OK or returns a 404 error
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html') || res.status === 404) {
        console.warn("API request returned HTML layout or 404. Falling back to client-side database sandbox for this request.");
        return handleMockRequest(cleanUrl, init);
      }
      return res;
    } catch (err) {
      console.warn("API response failed. Falling back to client-side database sandbox for this request.", err);
      return handleMockRequest(cleanUrl, init);
    }
  }
  
  return originalFetch(input, init);
};

try {
  // Define on window instance using Object.defineProperty to override any read-only/native descriptors safely
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    writable: true,
    configurable: true
  });
  
  if (typeof globalThis !== 'undefined') {
    Object.defineProperty(globalThis, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true
    });
  }
} catch (e) {
  console.warn("Object.defineProperty on window failed, trying direct assignments:", e);
  try {
    (window as any).fetch = customFetch;
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).fetch = customFetch;
    }
  } catch (e2) {
    console.error("Critical: Intercepting window.fetch failed completely.", e2);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

