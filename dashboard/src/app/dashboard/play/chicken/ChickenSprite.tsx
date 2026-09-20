interface Props { size?: number; flapping?: boolean; frightened?: boolean }

// A tiny cartoon chicken. Body ellipse, head, red comb, yellow beak,
// black eye, orange legs, and one animated wing. Sized via `size` px
// so the same sprite works everywhere it lands.
export default function ChickenSprite({ size = 56, flapping = false, frightened = false }: Props) {
  const eyeCy = frightened ? 23 : 25;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      {/* legs behind body */}
      <line x1="24" y1="50" x2="22" y2="57" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="34" y1="50" x2="36" y2="57" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
      {/* feet */}
      <path d="M20 57 h6" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M34 57 h6" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />

      {/* body */}
      <ellipse cx="30" cy="40" rx="18" ry="14" fill="#FAFAFA" stroke="#D4D4D4" strokeWidth="1" />

      {/* tail feathers */}
      <path d="M12 36 Q6 30 10 26 Q6 34 14 40 Z" fill="#F5F5F5" stroke="#D4D4D4" strokeWidth="1" />

      {/* head */}
      <circle cx="42" cy="28" r="10" fill="#FAFAFA" stroke="#D4D4D4" strokeWidth="1" />

      {/* comb */}
      <path d="M40 18 Q41 12 43 17 Q45 12 47 17 Q48 12 50 18 Z" fill="#EF4444" />

      {/* wattle under beak */}
      <path d="M50 30 Q52 33 50 35 Z" fill="#EF4444" />

      {/* beak */}
      <path d="M51 27 L57 29 L51 31 Z" fill="#F59E0B" stroke="#B45309" strokeWidth="0.5" />

      {/* eye */}
      <circle cx="44" cy={eyeCy} r="1.8" fill="#0A0A0A" />
      <circle cx="44.5" cy={eyeCy - 0.5} r="0.6" fill="#FFF" />

      {/* wing — flaps by scaling on Y when running */}
      <g
        style={{
          transformOrigin: '30px 38px',
          transformBox: 'fill-box',
          animation: flapping ? 'flap 0.28s ease-in-out infinite' : 'none',
        }}
      >
        <ellipse
          cx="28" cy="40" rx="9" ry="6.5"
          fill="#E5E5E5" stroke="#B5B5B5" strokeWidth="1"
          transform="rotate(-15 28 40)"
        />
        <path d="M22 42 L24 44 M26 43 L28 45 M30 42 L32 44" stroke="#B5B5B5" strokeWidth="0.8" />
      </g>
    </svg>
  );
}
