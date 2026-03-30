import React, { useState, useEffect, useCallback, useRef } from 'react';
import queueLogo from './assets/queue-logo.svg';

export default function App() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null = add mode, object = edit mode
  const [title, setTitle] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState('queue');
  const [theme, setTheme] = useState(() => localStorage.getItem('queue-theme') || 'dark');
  const fileInputRef = useRef(null);

  // Drag-to-reorder state
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

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

  const filteredItems = items.filter(item =>
    tab === 'queue' ? !item.watched : !!item.watched
  );

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
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setTitle(item.title);
    setImageFile(null);
    setImagePreview(getImageSrc(item));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setTitle('');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingItem) {
      // Edit mode
      let imageName = editingItem.image_url;
      let removeOldImage = false;

      if (imageFile) {
        // New image uploaded — save it and remove the old one
        const arrayBuffer = await imageFile.arrayBuffer();
        imageName = await window.api.saveImage(Array.from(new Uint8Array(arrayBuffer)), imageFile.name);
        removeOldImage = true;
      } else if (!imagePreview && editingItem.image_url) {
        // User removed the image without adding a new one
        imageName = null;
        removeOldImage = true;
      }

      await window.api.updateItem({
        id: editingItem.id,
        title: title.trim(),
        image_url: imageName,
        removeOldImage,
      });
    } else {
      // Add mode
      let imageName = null;
      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        imageName = await window.api.saveImage(Array.from(new Uint8Array(arrayBuffer)), imageFile.name);
      }
      await window.api.addItem({ title: title.trim(), image_url: imageName });
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
      const currentList = [...filteredItems];
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

  const queueCount = items.filter(i => !i.watched).length;
  const watchedCount = items.filter(i => !!i.watched).length;

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">
          <img src={queueLogo} alt="Q" className="logo-icon" />
          <span className="logo-wordmark">ueue</span>
        </h1>

        <div className="header-spacer" />

        <div className="header-center">
          <div className="tabs">
            <button
              className={`tab ${tab === 'queue' ? 'tab--active' : ''}`}
              onClick={() => setTab('queue')}
            >
              Queue {queueCount > 0 && <span className="tab-count">{queueCount}</span>}
            </button>
            <button
              className={`tab ${tab === 'watched' ? 'tab--active' : ''}`}
              onClick={() => setTab('watched')}
            >
              Watched {watchedCount > 0 && <span className="tab-count">{watchedCount}</span>}
            </button>
          </div>
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

      {filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{tab === 'queue' ? '🍿' : '✅'}</div>
          <h3>{tab === 'queue' ? 'Your queue is empty' : 'Nothing watched yet'}</h3>
          <p>{tab === 'queue' ? 'Add something to watch, listen to, or play!' : 'Mark items as watched and they\'ll show up here'}</p>
          {tab === 'queue' && (
            <button className="btn-add-first" onClick={openAddModal}>+ Add to Queue</button>
          )}
        </div>
      ) : (
        <div className="grid">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className={`card ${draggedId === item.id ? 'card--dragging' : ''} ${dragOverId === item.id && draggedId !== item.id ? 'card--drag-over' : ''}`}
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
                  🎬
                </div>
              </div>
              <div className="card-title">{item.title}</div>
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="item-modal" onClick={(e) => e.stopPropagation()}>
            <div className="item-modal-poster">
              {getImageSrc(selectedItem) ? (
                <img src={getImageSrc(selectedItem)} alt={selectedItem.title} />
              ) : (
                <div className="item-modal-placeholder">🎬</div>
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
                      <div className="upload-icon">📷</div>
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
    </div>
  );
}
