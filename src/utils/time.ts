export const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '0s';
  }

  const seconds = Math.floor(milliseconds / 1000);
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const parts: string[] = [];

  if (mins) {
    parts.push(`${mins}m`);
  }

  parts.push(`${remainingSeconds}s`);
  return parts.join(' ');
};
