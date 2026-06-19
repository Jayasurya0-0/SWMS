import React, { useState, useMemo } from 'react';

// Global cache Set of failed photo URLs during the application session
// This avoids duplicate network requests when components mount/unmount frequently
const failedPhotoUrls = new Set<string>();

interface EmployeeAvatarProps {
  photoUrl?: string;
  name: string;
  className?: string;
}

export const EmployeeAvatar: React.FC<EmployeeAvatarProps> = React.memo(({ 
  photoUrl, 
  name, 
  className = "w-10 h-10 rounded-full" 
}) => {
  // Use session cache immediately to prevent state triggering another render
  const isPreviouslyFailed = photoUrl ? failedPhotoUrls.has(photoUrl) : true;
  const [hasError, setHasError] = useState(isPreviouslyFailed);

  // Memoize computation of employee initials to conserve CPU cycles in large lists
  const initials = useMemo(() => {
    if (!name) return 'OP';
    const trimmed = name.trim();
    if (!trimmed) return 'OP';
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);

  // Validate URL to prune random placeholder services and satisfy local database constraints
  const isValidUrl = useMemo(() => {
    if (!photoUrl || photoUrl.trim() === '') return false;
    // Suppress external stock placeholder platforms unless they're explicit custom uploads
    if (
      photoUrl.includes('images.unsplash.com') || 
      photoUrl.includes('placeholder') || 
      photoUrl.includes('dicebear') || 
      photoUrl.includes('robohash')
    ) {
      return false;
    }
    return true;
  }, [photoUrl]);

  if (!isValidUrl || hasError) {
    return (
      <div 
        id={`avatar-initials-${name.replace(/\D/g, '')}`}
        className={`${className} flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono font-bold text-xs select-none shrink-0`}
        title={name}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={name}
      className={`${className} object-cover shrink-0`}
      onError={() => {
        // Suppress warning logs completely during production/dev.
        // Record failure in local session cache.
        if (photoUrl) {
          failedPhotoUrls.add(photoUrl);
        }
        setHasError(true);
      }}
      referrerPolicy="no-referrer"
    />
  );
});

EmployeeAvatar.displayName = 'EmployeeAvatar';
