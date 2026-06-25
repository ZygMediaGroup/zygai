// hooks/useImageAttachment.ts
import { useState } from 'react';
import { SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '../utils/fileToBase64';
import type { ImageAttachment } from '@/types';
import { API_BASE } from '@/utils/apiBase';

export const useImageAttachment = () => {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const attach = async (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      throw new Error('Unsupported format. Use JPEG, PNG, GIF or WebP.');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error('Image too large (max 5MB).');
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const token = localStorage.getItem('zygai:token');
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload image.');
      }

      const data = await response.json();
      const url = data.url;
      const previewUrl = URL.createObjectURL(file);

      const attachment: ImageAttachment = {
        url,
        mediaType: file.type as ImageAttachment['mediaType'],
        name: file.name,
        previewUrl,
      };

      setAttachments(prev => [...prev, attachment]);
    } finally {
      setIsUploading(false);
    }
  };

  const clear = (index: number) => {
    setAttachments(prev => {
      const newAttachments = [...prev];
      const removed = newAttachments.splice(index, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return newAttachments;
    });
  };

  const clearAll = () => {
    attachments.forEach(att => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
    });
    setAttachments([]);
  };

  return { attachments, attach, clear, clearAll, isUploading };
};