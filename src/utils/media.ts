/**
 * Utility for parsing and extracting YouTube video IDs and building embed URLs.
 */
export function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    // Check if already an embed or standard youtube URL
    const regExp = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmed.match(regExp);

    if (match && match[1]) {
      const videoId = match[1];
      return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    }
  } catch {
    // Parsing fallback
  }

  return null;
}
