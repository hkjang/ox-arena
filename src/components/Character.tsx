import { memo } from 'react';

const SKIN = ['#fde0c8', '#f5c9a0', '#e3a977', '#c68642'];
const HAIR = ['#1f2937', '#78350f', '#b45309', '#111827', '#7c2d12', '#4b5563', '#a16207', '#be185d'];
const SHIRT = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#a78bfa', '#facc15', '#34d399', '#f87171'];

interface Props {
  avatar: number;
  gender: 'M' | 'F';
  name?: string;
  size?: number;
  crown?: boolean;
  streak?: number;
  mine?: boolean;
  wrong?: boolean;
  right?: boolean;
}

function CharacterBase({ avatar, gender, name, size = 40, crown, streak = 0, mine, wrong, right }: Props) {
  const skin = SKIN[avatar % SKIN.length];
  const hair = HAIR[(avatar >> 1) % HAIR.length];
  const shirt = SHIRT[(avatar * 3 + (gender === 'F' ? 1 : 0)) % SHIRT.length];
  const style = Math.floor(avatar / 4) % 4;
  return (
    <div className={`char ${mine ? 'mine' : ''} ${wrong ? 'wrong' : ''} ${right ? 'right' : ''}`} style={{ width: size }}>
      {name && <div className="char-name" style={{ fontSize: Math.max(9, size * 0.28) }}>{name}</div>}
      {streak >= 3 && <div className="char-combo" style={{ fontSize: Math.max(9, size * 0.26) }}>🔥{streak}</div>}
      {crown && <div className="char-crown" style={{ fontSize: size * 0.5 }}>👑</div>}
      <svg viewBox="0 0 40 48" width={size} height={size * 1.2}>
        <ellipse cx="20" cy="46" rx="11" ry="2" fill="rgba(0,0,0,.25)" />
        <rect x="9" y="27" width="22" height="16" rx="7" fill={shirt} />
        <rect x="14" y="40" width="4.5" height="6" rx="2" fill="#334155" />
        <rect x="21.5" y="40" width="4.5" height="6" rx="2" fill="#334155" />
        {/* hair back */}
        {gender === 'F' && <rect x="8" y="10" width="24" height="22" rx="10" fill={hair} />}
        <circle cx="20" cy="18" r="11" fill={skin} />
        {/* hair front */}
        {gender === 'M' ? (
          style % 2 === 0
            ? <path d="M9 17 C9 6 31 6 31 17 C27 12 13 12 9 17Z" fill={hair} />
            : <path d="M9 18 C8 5 32 5 31 18 L28 12 L22 14 L16 11 L12 14Z" fill={hair} />
        ) : (
          style % 2 === 0
            ? <path d="M8 19 C7 5 33 5 32 19 C30 11 22 9 20 9 C18 9 10 11 8 19Z" fill={hair} />
            : <path d="M9 17 C10 6 30 6 31 17 C26 14 22 11 20 9 C18 12 14 14 9 17Z" fill={hair} />
        )}
        {wrong ? (
          <>
            <path d="M14.5 17l3 3m0-3l-3 3M22.5 17l3 3m0-3l-3 3" stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M16.5 25 Q20 22 23.5 25" stroke="#0f172a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="16" cy="19" r="1.6" fill="#0f172a" />
            <circle cx="24" cy="19" r="1.6" fill="#0f172a" />
            <path d="M16.5 23.5 Q20 27 23.5 23.5" stroke="#0f172a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </>
        )}
        {gender === 'F' && <circle cx="29" cy="12" r="2.4" fill="#f43f5e" />}
      </svg>
    </div>
  );
}

export const Character = memo(CharacterBase);
