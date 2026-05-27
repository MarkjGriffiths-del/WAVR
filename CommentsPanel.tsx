/**
 * CommentsPanel
 * Shows timestamped comments for a version.
 * New comments from other listeners arrive in real time via Supabase Realtime.
 * Clicking a comment timestamp seeks the player to that position.
 */
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface Comment {
  id:           string;
  body:         string;
  author_name:  string | null;
  timestamp_ms: number | null;
  created_at:   string;
  profiles?: { display_name: string | null } | null;
}

interface CommentsPanelProps {
  versionId:     string;
  shareLinkId?:  string;
  allowComments: boolean;
  positionMs:    number;
  onSeek:        (ms: number) => void;
}

function fmtMs(ms: number | null) {
  if (ms === null) return null;
  const s   = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CommentsPanel({ versionId, allowComments, positionMs, onSeek }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody]         = useState('');
  const [name, setName]         = useState('');
  const [stamp, setStamp]       = useState(true);  // attach current timestamp
  const [sending, setSending]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    supabase
      .from('comments')
      .select('id, body, author_name, timestamp_ms, created_at, profiles(display_name)')
      .eq('version_id', versionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setComments(data as Comment[]); });
  }, [versionId]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${versionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comments',
        filter: `version_id=eq.${versionId}`,
      }, payload => {
        setComments(c => [...c, payload.new as Comment]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [versionId]);

  const submit = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from('comments').insert({
      version_id:   versionId,
      body:         body.trim(),
      author_name:  name.trim() || 'Anonymous',
      timestamp_ms: stamp ? Math.round(positionMs) : null,
    });
    if (!error) setBody('');
    setSending(false);
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        Comments <span style={styles.badge}>{comments.length}</span>
      </div>

      <div style={styles.list}>
        {comments.length === 0 && (
          <p style={styles.empty}>No comments yet.</p>
        )}
        {comments.map(c => (
          <div key={c.id} style={styles.comment}>
            <div style={styles.commentMeta}>
              <span style={styles.authorName}>
                {c.profiles?.display_name ?? c.author_name ?? 'Anonymous'}
              </span>
              {c.timestamp_ms !== null && (
                <button
                  style={styles.tsBtn}
                  onClick={() => onSeek(c.timestamp_ms!)}
                  title="Jump to this moment"
                >
                  @ {fmtMs(c.timestamp_ms)}
                </button>
              )}
              <span style={styles.timeAgo}>{timeAgo(c.created_at)}</span>
            </div>
            <p style={styles.commentBody}>{c.body}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {allowComments && (
        <div style={styles.inputArea}>
          <input
            style={styles.nameInput}
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div style={styles.inputRow}>
            <textarea
              style={styles.textarea}
              placeholder="Leave a note..."
              value={body}
              rows={2}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            />
            <button style={styles.sendBtn} onClick={submit} disabled={sending || !body.trim()}>
              {sending ? '…' : '↑'}
            </button>
          </div>
          <label style={styles.stampLabel}>
            <input
              type="checkbox"
              checked={stamp}
              onChange={e => setStamp(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Attach timestamp ({fmtMs(positionMs) ?? '0:00'})
          </label>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column',
    borderLeft: '0.5px solid rgba(255,255,255,0.07)',
    width: 240, flexShrink: 0,
    fontFamily: "'Syne', sans-serif",
  },
  header: {
    padding: '14px 16px 10px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
    color: 'rgba(232,228,220,0.35)', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 8,
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
  },
  badge: {
    background: 'rgba(255,255,255,0.07)', borderRadius: 4,
    padding: '1px 6px', fontSize: 10,
  },
  list: {
    flex: 1, overflowY: 'auto', padding: '10px 16px',
  },
  empty: {
    fontSize: 12, color: 'rgba(232,228,220,0.25)', textAlign: 'center', marginTop: 24,
  },
  comment: {
    marginBottom: 16,
  },
  commentMeta: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
  },
  authorName: {
    fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.7)',
  },
  tsBtn: {
    background: 'rgba(201,245,94,0.08)', border: '0.5px solid rgba(201,245,94,0.2)',
    borderRadius: 3, padding: '1px 6px', fontSize: 10,
    color: '#c9f55e', cursor: 'pointer', fontFamily: "'DM Mono', monospace",
  },
  timeAgo: {
    fontSize: 10, color: 'rgba(232,228,220,0.25)',
    marginLeft: 'auto', fontFamily: "'DM Mono', monospace",
  },
  commentBody: {
    fontSize: 12, color: 'rgba(232,228,220,0.5)', lineHeight: 1.45, margin: 0,
  },
  inputArea: {
    padding: '10px 14px 14px',
    borderTop: '0.5px solid rgba(255,255,255,0.07)',
  },
  nameInput: {
    width: '100%', marginBottom: 8, padding: '6px 10px',
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: '#e8e4dc', fontSize: 12,
    fontFamily: "'Syne', sans-serif", outline: 'none', boxSizing: 'border-box',
  },
  inputRow: {
    display: 'flex', gap: 6,
  },
  textarea: {
    flex: 1, padding: '7px 10px', resize: 'none',
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: '#e8e4dc', fontSize: 12,
    fontFamily: "'Syne', sans-serif", outline: 'none',
  },
  sendBtn: {
    background: 'rgba(201,245,94,0.1)', border: '0.5px solid rgba(201,245,94,0.25)',
    borderRadius: 6, padding: '0 12px', color: '#c9f55e',
    fontSize: 16, cursor: 'pointer', alignSelf: 'stretch',
  },
  stampLabel: {
    display: 'flex', alignItems: 'center', marginTop: 8,
    fontSize: 11, color: 'rgba(232,228,220,0.3)', cursor: 'pointer',
  },
};
