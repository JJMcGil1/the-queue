import React, { useState, useEffect, useCallback, useRef } from 'react';
import queueLogo from './assets/queue-logo.svg';
import UpdateToast from './components/UpdateToast';
import BrowserWebview, { detectPlatform, QUICK_LINKS } from './components/BrowserView';

export default function App() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [title, setTitle] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [itemUrl, setItemUrl] = useState('');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('queue-theme') || 'dark');
  const fileInputRef = useRef(null);

  // Drag-to-reorder state
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Navigation state: 'dashboard', 'queue', or a service name
  const [view, setView] = useState('dashboard');
  const [queueFilter, setQueueFilter] = useState('all'); // 'all', 'unwatched', 'watched'

  // Browser state
  const browserRef = useRef(null);
  const [browserSrc, setBrowserSrc] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [, setNavTick] = useState(0);

  const loadItems = useCallback(async () => {
    const data = await window.api.getItems({ search: search || undefined });
    setItems(data);
  }, [search]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('queue-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const getFilteredItems = () => {
    if (queueFilter === 'watched') return items.filter(i => !!i.watched);
    if (queueFilter === 'unwatched') return items.filter(i => !i.watched);
    return items;
  };

  const getImageSrc = (item) => {
    if (!item.image_url) return null;
    if (item.image_url.startsWith('http')) return item.image_url;
    return `queue-image://${item.image_url}`;
  };

  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setTitle('');
    setItemUrl('');
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setTitle(item.title);
    setItemUrl(item.url || '');
    setImageFile(null);
    setImagePreview(getImageSrc(item));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setTitle('');
    setItemUrl('');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingItem) {
      let imageName = editingItem.image_url;
      let removeOldImage = false;

      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        imageName = await window.api.saveImage(Array.from(new Uint8Array(arrayBuffer)), imageFile.name);
        removeOldImage = true;
      } else if (!imagePreview && editingItem.image_url) {
        imageName = null;
        removeOldImage = true;
      }

      await window.api.updateItem({
        id: editingItem.id,
        title: title.trim(),
        image_url: imageName,
        url: itemUrl.trim() || null,
        platform: detectPlatform(itemUrl.trim()) || null,
        removeOldImage,
      });
    } else {
      let imageName = null;
      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        imageName = await window.api.saveImage(Array.from(new Uint8Array(arrayBuffer)), imageFile.name);
      }
      await window.api.addItem({
        title: title.trim(),
        image_url: imageName,
        url: itemUrl.trim() || null,
        platform: detectPlatform(itemUrl.trim()) || null,
      });
    }

    closeModal();
    loadItems();
  };

  const handleDelete = async (id) => {
    await window.api.deleteItem(id);
    loadItems();
  };

  const handleToggleWatched = async (id) => {
    await window.api.toggleWatched(id);
    loadItems();
  };

  // --- Drag-to-reorder handlers ---
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = async (e) => {
    e.currentTarget.style.opacity = '1';
    if (draggedId !== null && dragOverId !== null && draggedId !== dragOverId) {
      const currentList = [...getFilteredItems()];
      const draggedIndex = currentList.findIndex(i => i.id === draggedId);
      const overIndex = currentList.findIndex(i => i.id === dragOverId);
      if (draggedIndex !== -1 && overIndex !== -1) {
        const [moved] = currentList.splice(draggedIndex, 1);
        currentList.splice(overIndex, 0, moved);
        const reorderList = currentList.map((item, idx) => ({ id: item.id, sort_order: idx }));
        await window.api.reorderItems(reorderList);
        await loadItems();
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  // --- Navigation ---
  const showBrowser = browserSrc !== null;

  const handleServiceClick = (link) => {
    setBrowserSrc(link.url);
    setView(link.name);
    setSidebarCollapsed(true);
    setTimeout(() => setNavTick(t => t + 1), 500);
  };

  const handleNavClick = (newView) => {
    setView(newView);
    setBrowserSrc(null);
  };

  const handleWatch = (item) => {
    setBrowserSrc(item.url);
    setView(detectPlatform(item.url) || 'streaming');
    setSelectedItem(null);
    setSidebarCollapsed(true);
    setTimeout(() => setNavTick(t => t + 1), 500);
  };

  const handleSaveFromBrowser = async () => {
    if (!browserRef.current) return;
    const currentUrl = browserRef.current.getURL();
    const currentTitle = browserRef.current.getTitle() || currentUrl;
    const platform = detectPlatform(currentUrl);
    await window.api.addItem({ title: currentTitle, url: currentUrl, platform, image_url: null });
    loadItems();
    setSaveConfirm(true);
    setTimeout(() => setSaveConfirm(false), 2000);
  };

  const queueCount = items.filter(i => !i.watched).length;
  const watchedCount = items.filter(i => !!i.watched).length;
  const totalCount = items.length;

  const canGoBack = browserRef.current?.canGoBack || false;
  const canGoForward = browserRef.current?.canGoForward || false;
  const isLoading = browserRef.current?.isLoading || false;

  // Dashboard data
  const recentQueue = items.filter(i => !i.watched).slice(0, 6);

  const renderCard = (item) => (
    <div
      key={item.id}
      className={`card ${item.watched ? 'card--watched' : ''} ${draggedId === item.id ? 'card--dragging' : ''} ${dragOverId === item.id && draggedId !== item.id ? 'card--drag-over' : ''}`}
      draggable
      onDragStart={(e) => handleDragStart(e, item.id)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, item.id)}
      onClick={() => setSelectedItem(item)}
    >
      <div className="card-image">
        {getImageSrc(item) ? (
          <img src={getImageSrc(item)} alt={item.title} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        ) : null}
        <div className="card-placeholder" style={getImageSrc(item) ? { display: 'none' } : {}}>
          {String.fromCodePoint(0x1F3AC)}
        </div>
        {!!item.watched && (
          <div className="card-watched-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        )}
        {item.url && !item.watched && (
          <div className="card-platform-badge" title={item.platform || 'Has link'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        )}
      </div>
      <div className="card-title">
        {!!item.watched && <span className="card-title-check">{String.fromCharCode(10003)}</span>}
        {item.title}
      </div>
      {item.platform && (
        <div className="card-platform">{item.platform}</div>
      )}
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard">
      <div className="dashboard-inner">
      <div className="dashboard-section">
        <h2 className="dashboard-heading">Top Sites</h2>
        <div className="dashboard-sites">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.name}
              className="dashboard-site-card"
              onClick={() => handleServiceClick(link)}
              style={{ '--service-color': link.color }}
            >
              <img
                className="dashboard-site-icon"
                src={`https://www.google.com/s2/favicons?domain=${link.domain}&sz=64`}
                alt={link.name}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="dashboard-site-fallback" style={{ background: link.color }}>
                {link.name.charAt(0)}
              </div>
              <span className="dashboard-site-name">{link.name}</span>
            </button>
          ))}
        </div>
      </div>

      {recentQueue.length > 0 && (
        <div className="dashboard-section">
          <div className="dashboard-heading-row">
            <h2 className="dashboard-heading">Up Next</h2>
            <button className="dashboard-see-all" onClick={() => handleNavClick('queue')}>
              See all {String.fromCharCode(8250)}
            </button>
          </div>
          <div className="dashboard-queue-grid">
            {recentQueue.map(renderCard)}
          </div>
        </div>
      )}
      </div>
    </div>
  );

  const renderQueue = () => {
    const filteredItems = getFilteredItems();
    return (
      <div className="queue-page">
        <div className="queue-header">
          <div className="queue-filters">
            <button
              className={`queue-filter ${queueFilter === 'all' ? 'queue-filter--active' : ''}`}
              onClick={() => setQueueFilter('all')}
            >
              All <span className="queue-filter-count">{totalCount}</span>
            </button>
            <button
              className={`queue-filter ${queueFilter === 'unwatched' ? 'queue-filter--active' : ''}`}
              onClick={() => setQueueFilter('unwatched')}
            >
              Queue <span className="queue-filter-count">{queueCount}</span>
            </button>
            <button
              className={`queue-filter ${queueFilter === 'watched' ? 'queue-filter--active' : ''}`}
              onClick={() => setQueueFilter('watched')}
            >
              Watched <span className="queue-filter-count">{watchedCount}</span>
            </button>
          </div>
        </div>
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{queueFilter === 'watched' ? String.fromCharCode(9989) : String.fromCodePoint(0x1F37F)}</div>
            <h3>{queueFilter === 'watched' ? 'Nothing watched yet' : 'Your queue is empty'}</h3>
            <p>{queueFilter === 'watched' ? "Mark items as watched and they'll show up here" : 'Add something to watch, listen to, or play!'}</p>
            {queueFilter !== 'watched' && (
              <button className="btn-add-first" onClick={openAddModal}>+ Add to Queue</button>
            )}
          </div>
        ) : (
          <div className="grid">
            {filteredItems.map(renderCard)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
        <h1 className="logo">
          <img src={queueLogo} alt="Q" className="logo-icon" />
          <span className="logo-wordmark">ueue</span>
        </h1>

        <div className="header-spacer" />

        <div className="header-center">
          <div className="search-wrapper">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-add" onClick={openAddModal} title="Add to queue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="header-spacer" />

        {/* Browser nav buttons */}
        <div className="header-nav-buttons">
          <button
            className="browser-nav-btn"
            disabled={!showBrowser || !canGoBack}
            onClick={() => browserRef.current?.goBack()}
            title="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button
            className="browser-nav-btn"
            disabled={!showBrowser || !canGoForward}
            onClick={() => browserRef.current?.goForward()}
            title="Forward"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <button
            className="browser-nav-btn"
            disabled={!showBrowser}
            onClick={() => {
              if (isLoading) browserRef.current?.stop();
              else browserRef.current?.reload();
            }}
            title={isLoading ? 'Stop' : 'Reload'}
          >
            {isLoading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            )}
          </button>
          {showBrowser && (
            <button
              className={`browser-save-btn ${saveConfirm ? 'browser-save-btn--confirmed' : ''}`}
              onClick={handleSaveFromBrowser}
              disabled={saveConfirm}
              title="Save current page to Queue"
            >
              {saveConfirm ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Save to Queue
                </>
              )}
            </button>
          )}
        </div>

        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </header>

      <div className="app-body">
        {/* Global Sidebar */}
        <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
          <div className="sidebar-list">
            {/* Dashboard */}
            <button
              className={`sidebar-item sidebar-item--nav ${view === 'dashboard' && !showBrowser ? 'sidebar-item--active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              <svg className="sidebar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span className="sidebar-item-name">Dashboard</span>
            </button>

            {/* My Queue */}
            <button
              className={`sidebar-item sidebar-item--nav ${view === 'queue' && !showBrowser ? 'sidebar-item--active' : ''}`}
              onClick={() => handleNavClick('queue')}
            >
              <svg className="sidebar-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span className="sidebar-item-name">My Queue</span>
              {queueCount > 0 && <span className="sidebar-badge">{queueCount}</span>}
            </button>

            <div className="sidebar-divider" />

            {/* Streaming Services */}
            <div className="sidebar-section-label">Streaming</div>
            {QUICK_LINKS.map((link) => (
              <button
                key={link.name}
                className={`sidebar-item ${view === link.name ? 'sidebar-item--active' : ''}`}
                onClick={() => handleServiceClick(link)}
                title={link.name}
                style={{ '--service-color': link.color }}
              >
                <img
                  className="sidebar-favicon"
                  src={`https://www.google.com/s2/favicons?domain=${link.domain}&sz=64`}
                  alt={link.name}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="sidebar-favicon-fallback" style={{ background: link.color }}>
                  {link.name.charAt(0)}
                </div>
                <span className="sidebar-item-name">{link.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {showBrowser ? (
            <BrowserWebview ref={browserRef} src={browserSrc} />
          ) : view === 'dashboard' ? (
            renderDashboard()
          ) : (
            renderQueue()
          )}
        </div>
      </div>

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="item-modal" onClick={(e) => e.stopPropagation()}>
            <div className="item-modal-poster">
              {getImageSrc(selectedItem) ? (
                <img src={getImageSrc(selectedItem)} alt={selectedItem.title} />
              ) : (
                <div className="item-modal-placeholder">{String.fromCodePoint(0x1F3AC)}</div>
              )}
            </div>
            <div className="item-modal-info">
              <h2 className="item-modal-title">{selectedItem.title}</h2>
              <div className="item-modal-actions">
                <button
                  className="item-action item-action--edit"
                  onClick={() => { setSelectedItem(null); openEditModal(selectedItem); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
                {selectedItem.url && (
                  <button
                    className="item-action item-action--watch"
                    onClick={() => handleWatch(selectedItem)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Watch Now
                    {selectedItem.platform && <span className="item-action-platform">{selectedItem.platform}</span>}
                  </button>
                )}
                <button
                  className={`item-action item-action--watched ${selectedItem.watched ? 'item-action--active' : ''}`}
                  onClick={async () => { await handleToggleWatched(selectedItem.id); setSelectedItem(null); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {selectedItem.watched ? 'Unwatched' : 'Watched'}
                </button>
                <button
                  className="item-action item-action--remove"
                  onClick={async () => { await handleDelete(selectedItem.id); setSelectedItem(null); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Remove
                </button>
              </div>
            </div>
            <button className="item-modal-close" onClick={() => setSelectedItem(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingItem ? 'Edit Item' : 'Add to Queue'}</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  placeholder="What do you want to watch?"
                />
              </div>
              <div className="form-group">
                <label>Streaming URL</label>
                <input
                  type="text"
                  value={itemUrl}
                  onChange={(e) => setItemUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... (optional)"
                />
              </div>
              <div className="form-group">
                <label>Cover Image</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
                <div
                  className={`upload-zone ${dragging ? 'upload-zone--active' : ''} ${imagePreview ? 'upload-zone--has-image' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFileSelect(e.dataTransfer.files[0]);
                  }}
                >
                  {imagePreview ? (
                    <div className="upload-preview">
                      <img src={imagePreview} alt="Preview" />
                      <button
                        type="button"
                        className="upload-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageFile(null);
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <div className="upload-icon">{String.fromCodePoint(0x1F4F7)}</div>
                      <span>Click or drag image here</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary">{editingItem ? 'Save Changes' : 'Add to Queue'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <UpdateToast />
    </div>
  );
}
