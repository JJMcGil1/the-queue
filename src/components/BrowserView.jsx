import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';

const PLATFORM_MAP = [
  { pattern: /youtube\.com|youtu\.be/, name: 'YouTube', icon: '▶' },
  { pattern: /netflix\.com/, name: 'Netflix', icon: '🎬' },
  { pattern: /disneyplus\.com|disney\+/, name: 'Disney+', icon: '✨' },
  { pattern: /hulu\.com/, name: 'Hulu', icon: '📺' },
  { pattern: /max\.com|hbomax\.com/, name: 'Max', icon: '🎭' },
  { pattern: /primevideo\.com|amazon\.com\/gp\/video/, name: 'Prime Video', icon: '📦' },
  { pattern: /tv\.apple\.com/, name: 'Apple TV+', icon: '🍎' },
  { pattern: /peacocktv\.com/, name: 'Peacock', icon: '🦚' },
  { pattern: /paramountplus\.com/, name: 'Paramount+', icon: '⛰' },
  { pattern: /crunchyroll\.com/, name: 'Crunchyroll', icon: '🍥' },
  { pattern: /twitch\.tv/, name: 'Twitch', icon: '💜' },
  { pattern: /vimeo\.com/, name: 'Vimeo', icon: '🎥' },
  { pattern: /tubi\.tv/, name: 'Tubi', icon: '📺' },
  { pattern: /pluto\.tv/, name: 'Pluto TV', icon: '📡' },
];

function detectPlatform(url) {
  if (!url) return null;
  for (const p of PLATFORM_MAP) {
    if (p.pattern.test(url)) return p.name;
  }
  return null;
}

const QUICK_LINKS = [
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#FF0000', domain: 'youtube.com' },
  { name: 'Netflix', url: 'https://www.netflix.com', color: '#E50914', domain: 'netflix.com' },
  { name: 'Disney+', url: 'https://www.disneyplus.com', color: '#113CCF', domain: 'disneyplus.com' },
  { name: 'Hulu', url: 'https://www.hulu.com', color: '#1CE783', domain: 'hulu.com' },
  { name: 'Max', url: 'https://www.max.com', color: '#002BE7', domain: 'max.com' },
  { name: 'Prime Video', url: 'https://www.primevideo.com', color: '#00A8E1', domain: 'primevideo.com' },
  { name: 'Apple TV+', url: 'https://tv.apple.com', color: '#555555', domain: 'tv.apple.com' },
  { name: 'Crunchyroll', url: 'https://www.crunchyroll.com', color: '#F47521', domain: 'crunchyroll.com' },
  { name: 'Twitch', url: 'https://www.twitch.tv', color: '#9146FF', domain: 'twitch.tv' },
  { name: 'Peacock', url: 'https://www.peacocktv.com', color: '#000000', domain: 'peacocktv.com' },
  { name: 'Paramount+', url: 'https://www.paramountplus.com', color: '#0064FF', domain: 'paramountplus.com' },
  { name: 'Tubi', url: 'https://www.tubi.tv', color: '#FA382F', domain: 'tubi.tv' },
];

const BrowserWebview = forwardRef(({ src }, ref) => {
  const webviewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onNavStart = () => setIsLoading(true);
    const onNavDone = () => {
      setIsLoading(false);
      setCurrentUrl(wv.getURL());
      setPageTitle(wv.getTitle());
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
    };
    const onTitleUpdate = (e) => setPageTitle(e.title);
    const onNavFail = () => setIsLoading(false);

    wv.addEventListener('did-start-loading', onNavStart);
    wv.addEventListener('did-stop-loading', onNavDone);
    wv.addEventListener('page-title-updated', onTitleUpdate);
    wv.addEventListener('did-fail-load', onNavFail);

    return () => {
      wv.removeEventListener('did-start-loading', onNavStart);
      wv.removeEventListener('did-stop-loading', onNavDone);
      wv.removeEventListener('page-title-updated', onTitleUpdate);
      wv.removeEventListener('did-fail-load', onNavFail);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    goBack: () => webviewRef.current?.goBack(),
    goForward: () => webviewRef.current?.goForward(),
    reload: () => webviewRef.current?.reload(),
    stop: () => webviewRef.current?.stop(),
    loadURL: (url) => webviewRef.current?.loadURL(url),
    getURL: () => webviewRef.current?.getURL() || currentUrl,
    getTitle: () => webviewRef.current?.getTitle() || pageTitle,
    get canGoBack() { return canGoBack; },
    get canGoForward() { return canGoForward; },
    get isLoading() { return isLoading; },
  }));

  return (
    <webview
      ref={webviewRef}
      className="browser-webview"
      src={src}
      partition="persist:queue-browser"
      allowpopups="true"
    />
  );
});

export default BrowserWebview;
export { detectPlatform, QUICK_LINKS };
