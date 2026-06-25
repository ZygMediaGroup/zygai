// utils/fileToBase64.ts
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });
};

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp'
];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB