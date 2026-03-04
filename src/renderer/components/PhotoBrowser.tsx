import React from 'react';
import { usePhotos, useThumbnail, useUpdateRecipientSettings } from '../hooks/useApi';
import Spinner from './shared/Spinner';
import type { PhotoAsset } from '../../shared/ipc-types';

interface ThumbnailTileProps {
  photo: PhotoAsset;
  isSent: boolean;
  isNextPhoto: boolean;
  onSetNext: (id: string) => void;
}

function ThumbnailTile({
  photo,
  isSent,
  isNextPhoto,
  onSetNext,
}: ThumbnailTileProps): React.ReactElement {
  const { data: base64, isLoading } = useThumbnail(photo.id);

  return (
    <div
      className="relative rounded overflow-hidden cursor-pointer group"
      style={{ aspectRatio: '4/3', background: 'var(--bg-card)' }}
      onClick={() => onSetNext(photo.id)}
      title={photo.filename}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={14} style={{ color: 'var(--text-tertiary)' } as React.CSSProperties} />
        </div>
      )}
      {base64 && (
        <img
          src={`data:image/jpeg;base64,${base64}`}
          alt={photo.filename}
          className="w-full h-full object-cover"
          style={{ opacity: isSent ? 0.4 : 1 }}
        />
      )}
      {isSent && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--text-secondary)' }}
          >
            Sent
          </span>
        </div>
      )}
      {isNextPhoto && (
        <div className="absolute inset-0 border-2 rounded" style={{ borderColor: 'var(--accent)' }}>
          <span
            className="absolute top-1 left-1 text-xs font-medium px-1 py-0.5 rounded"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Next
          </span>
        </div>
      )}
      {!isNextPhoto && !isSent && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-end justify-center pb-1 transition-opacity">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.7)', color: 'white' }}
          >
            Send Next
          </span>
        </div>
      )}
    </div>
  );
}

interface PhotoBrowserProps {
  albumName: string;
  recipientId: string;
  sentPhotoIds: Set<string>;
  nextPhotoId: string | null;
}

export default function PhotoBrowser({
  albumName,
  recipientId,
  sentPhotoIds,
  nextPhotoId,
}: PhotoBrowserProps): React.ReactElement {
  const { data: photos, isLoading } = usePhotos(albumName);
  const updateSettings = useUpdateRecipientSettings();

  const handleSetNext = async (photoId: string) => {
    const newId = nextPhotoId === photoId ? null : photoId;
    await updateSettings.mutateAsync({ recipient_id: recipientId, next_photo_id: newId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size={16} style={{ color: 'var(--text-secondary)' } as React.CSSProperties} />
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        No photos in this album
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {photos.map((photo) => (
        <ThumbnailTile
          key={photo.id}
          photo={photo}
          isSent={sentPhotoIds.has(photo.id)}
          isNextPhoto={nextPhotoId === photo.id}
          onSetNext={handleSetNext}
        />
      ))}
    </div>
  );
}
