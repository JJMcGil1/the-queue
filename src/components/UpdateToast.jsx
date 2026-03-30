import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function UpdateToast() {
  const [state, setState] = useState(null); // 'available' | 'downloading' | 'installing' | 'error'
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!window.updater) return;

    const cleanups = [
      window.updater.onUpdateAvailable(({ version: v }) => {
        setVersion(v);
        setState('available');
      }),
      window.updater.onDownloadProgress(({ percent }) => {
        setProgress(percent);
      }),
      window.updater.onUpdateDownloaded(() => {
        setState('installing');
        // Auto-install after download
        window.updater.installUpdate();
      }),
      window.updater.onUpdateError(({ message }) => {
        setErrorMessage(message);
        setState('error');
      }),
    ];

    return () => cleanups.forEach(fn => fn && fn());
  }, []);

  if (!state) return null;

  const handleDownload = () => {
    setState('downloading');
    setProgress(0);
    window.updater.downloadUpdate();
  };

  const handleDismiss = () => {
    setState(null);
    window.updater.dismissUpdate();
  };

  const handleRetry = () => {
    setState('downloading');
    setProgress(0);
    window.updater.downloadUpdate();
  };

  const toast = (
    <div className="update-toast" data-state={state}>
      {state === 'available' && (
        <>
          <div className="update-toast-text">
            <strong>Queue {version}</strong> is available
          </div>
          <div className="update-toast-actions">
            <button className="update-toast-btn update-toast-btn--secondary" onClick={handleDismiss}>Later</button>
            <button className="update-toast-btn update-toast-btn--primary" onClick={handleDownload}>Download</button>
          </div>
        </>
      )}

      {state === 'downloading' && (
        <>
          <div className="update-toast-text">Downloading update...</div>
          <div className="update-toast-progress">
            <div className="update-toast-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="update-toast-percent">{progress}%</div>
        </>
      )}

      {state === 'installing' && (
        <div className="update-toast-text">
          <span className="update-toast-spinner" />
          Restarting Queue...
        </div>
      )}

      {state === 'error' && (
        <>
          <div className="update-toast-text update-toast-text--error">
            Update failed: {errorMessage}
          </div>
          <div className="update-toast-actions">
            <button className="update-toast-btn update-toast-btn--secondary" onClick={handleDismiss}>Dismiss</button>
            <button className="update-toast-btn update-toast-btn--primary" onClick={handleRetry}>Retry</button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(toast, document.body);
}
