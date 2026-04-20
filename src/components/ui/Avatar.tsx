'use client';

interface AvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
}

export function getInitials(source: string | null | undefined): string {
  if (!source) return '??';
  return source
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Avatar({ photoUrl, name, email, size = 28, className }: AvatarProps) {
  const initials = getInitials(name ?? email ?? null);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name || 'Profile photo'}
        width={size}
        height={size}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid var(--border)',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      className={className ?? 'nav-user-avatar'}
      style={
        className
          ? undefined
          : { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }
      }
    >
      {initials}
    </div>
  );
}
