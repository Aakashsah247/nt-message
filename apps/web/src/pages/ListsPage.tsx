import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchMessagingContacts } from "../services/messaging.service";
import { listLists, createListApi, deleteListApi, addMemberApi, removeMemberApi } from "../services/lists.service";
import "../styles/lists.css";

export function ListsPage() {
  const [lists, setLists] = useState<Array<{ id: string; name: string; members: string[] }>>([]);
  const [name, setName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const selected = useMemo(() => lists.find((l) => l.id === selectedListId) ?? null, [lists, selectedListId]);
  const { accessToken } = useAuth();

  // persistence
  useEffect(() => {
    try {
      const raw = localStorage.getItem("message_lists_v1");
      if (raw) setLists(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const res = await listLists();
        setLists(res.data);
      } catch (e) {
        // ignore
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    try {
      localStorage.setItem("message_lists_v1", JSON.stringify(lists));
    } catch (e) {
      // ignore
    }
  }, [lists]);

  useEffect(() => {
    setHighlightIndex(searchResults.length ? 0 : -1);
  }, [searchResults]);

  useEffect(() => {
    try {
      localStorage.setItem("message_lists_v1", JSON.stringify(lists));
    } catch (e) {
      // ignore
    }
  }, [lists]);

  // contact search
  const [searchResults, setSearchResults] = useState<Array<{ accountId: string; displayName: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  
  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }

    const q = memberInput.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (!accessToken) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    // debounce
    searchTimer.current = window.setTimeout(async () => {
      try {
        const res = await searchMessagingContacts(accessToken, q, 10);
        setSearchResults(res.data.map((c) => ({ accountId: c.accountId, displayName: c.displayName })));
      } catch (e) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [memberInput, accessToken]);

  function createList() {
    if (!name.trim()) return;
    const id = String(Date.now());
    const newList = { id, name: name.trim(), members: [] };
    setLists((s) => [newList, ...s]);
    setName("");
    setSelectedListId(id);
    if (accessToken) {
      void createListApi(newList.name).then((r) => {
        setLists((s) => [r.data, ...s.filter((x) => x.id !== r.data.id)]);
        setSelectedListId(r.data.id);
      }).catch(() => {});
    }
  }

  function deleteList(id: string) {
    setLists((s) => s.filter((l) => l.id !== id));
    if (selectedListId === id) setSelectedListId(null);
    if (accessToken) void deleteListApi(id).catch(() => {});
  }

  function addMember() {
    if (!memberInput.trim() || !selectedListId) return;
    const memberName = memberInput.trim();
    setLists((s) => s.map((l) => (l.id === selectedListId ? { ...l, members: [...l.members, memberName] } : l)));
    setMemberInput("");
    if (accessToken) void addMemberApi(selectedListId, memberName).then((r) => {
      setLists((s) => s.map((l) => (l.id === selectedListId ? r.data : l)));
    }).catch(() => {});
  }

  function removeMember(idx: number) {
    if (!selectedListId) return;
    setLists((s) =>
      s.map((l) => (l.id === selectedListId ? { ...l, members: l.members.filter((_, i) => i !== idx) } : l))
    );
    if (accessToken) void removeMemberApi(selectedListId, idx).then((r) => {
      setLists((s) => s.map((l) => (l.id === selectedListId ? r.data : l)));
    }).catch(() => {});
  }

  return (
    <div className="lists-page">
      <aside className="lists-side">
        <header className="lists-side__header">
          <h2>Create new list</h2>
        </header>

        <div className="lists-side__body">
          <label className="field">
            <div className="field__label">List name</div>
            <input
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name"
              aria-label="List name"
            />
          </label>

          <div className="members-block">
            <div className="members-block__title">Included</div>
            <div className="members-block__controls">
              <button
                className="add-member-btn"
                onClick={() => {
                  if (!selectedListId) {
                    createList();
                  }
                }}
              >
                + Add people or groups
              </button>
            </div>

            <div className="members-list">
              {selected ? (
                <>
                  <div className="member-input-row">
                    <input
                      value={memberInput}
                      onChange={(e) => { setMemberInput(e.target.value); setHighlightIndex(-1); }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightIndex((i) => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (highlightIndex >= 0 && searchResults[highlightIndex]) {
                            const sel = searchResults[highlightIndex];
                            if (selectedListId) {
                              setLists((s) => s.map((l) => (l.id === selectedListId ? { ...l, members: [...l.members, sel.displayName] } : l)));
                              if (accessToken) void addMemberApi(selectedListId, sel.displayName).then((r) => setLists((s) => s.map((l) => (l.id === selectedListId ? r.data : l)))).catch(() => {});
                              setMemberInput('');
                              setSearchResults([]);
                              setHighlightIndex(-1);
                            }
                          } else {
                            addMember();
                          }
                        }
                      }}
                      className="member-input"
                      placeholder="Search people or groups"
                      aria-label="Search people or groups"
                      aria-autocomplete="list"
                      aria-controls="lists-search-results"
                    />
                    <button className="btn btn--primary" onClick={addMember} aria-label="Add member button">
                      Add
                    </button>
                  </div>

                  {memberInput.trim().length > 0 && (
                    <div className="search-results" role="listbox" id="lists-search-results">
                      {isSearching ? (
                        <div className="search-loading">Searching…</div>
                      ) : searchResults.length ? (
                        <ul>
                          {searchResults.map((r, idx) => (
                            <li key={r.accountId} className={`search-result-item ${highlightIndex === idx ? 'highlight' : ''}`} role="option" aria-selected={highlightIndex === idx}>
                              <button
                                onMouseEnter={() => setHighlightIndex(idx)}
                                onClick={() => {
                                  if (!selectedListId) return;
                                  setLists((s) => s.map((l) => (l.id === selectedListId ? { ...l, members: [...l.members, r.displayName] } : l)));
                                  setMemberInput('');
                                  setSearchResults([]);
                                  setHighlightIndex(-1);
                                  if (accessToken) void addMemberApi(selectedListId, r.displayName).then((resp) => setLists((s) => s.map((l) => (l.id === selectedListId ? resp.data : l)))).catch(() => {});
                                }}
                              >
                                {r.displayName}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="search-empty">No results</div>
                      )}
                    </div>
                  )}

                  <ul className="member-chips">
                    {selected.members.map((m, i) => (
                      <li key={i} className="member-chip">
                        <span>{m}</span>
                        <button aria-label={`Remove ${m}`} onClick={() => removeMember(i)} className="remove-chip">
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="members-empty">No list selected. Create a new list to add people or groups.</p>
              )}
            </div>
          </div>

          <div className="lists-actions">
            <button className="btn btn--secondary" onClick={() => {}}>Create list</button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setName("");
                setMemberInput("");
                setSelectedListId(null);
              }}
            >
              Cancel
            </button>
          </div>

          <div className="existing-lists">
            <h3>Your lists</h3>
            <ul>
              {lists.map((l) => (
                <li key={l.id} className={`list-item ${selectedListId === l.id ? "active" : ""}`}>
                      <div className="list-item__row">
                        <button
                          onClick={() => setSelectedListId(l.id)}
                          className="list-item__btn"
                          aria-pressed={selectedListId === l.id}
                        >
                          <div className="list-item__name">{l.name}</div>
                          <div className="list-item__meta">{l.members.length} included</div>
                        </button>
                        <button className="list-item__delete" onClick={() => deleteList(l.id)} aria-label="Delete list">
                          🗑
                        </button>
                      </div>
                </li>
              ))}
              {lists.length === 0 && <li className="no-lists">No lists yet</li>}
            </ul>
          </div>
        </div>
      </aside>

      <main className="lists-main">
        <section className="promo-card">
          <div className="promo-card__inner">
            <div className="promo-illustration" aria-hidden>
              {/* simple SVG placeholder */}
              <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="108" height="68" rx="8" fill="#E9F6F0" stroke="#BEECD9" />
                <circle cx="36" cy="36" r="12" fill="#97F0B0" />
                <rect x="56" y="24" width="44" height="28" rx="4" fill="#fff" stroke="#DDEFE6" />
              </svg>
            </div>
            <h3>Download WhatsApp for Mac</h3>
            <p className="muted">Make calls and get a faster experience when you download the Mac app.</p>
            <div className="promo-actions">
              <button className="btn btn--primary">Get from App Store</button>
            </div>
          </div>
        </section>

        <section className="quick-actions">
          <div className="quick-actions__item">Send document</div>
          <div className="quick-actions__item">Add contact</div>
          <div className="quick-actions__item">Ask AI</div>
        </section>
      </main>
    </div>
  );
}

export default ListsPage;
