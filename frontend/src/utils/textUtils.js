// Text utility functions
export const truncateText = (text, maxLength = 100) => {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
};

export const formatVideoTitle = (title, platform) => {
  const truncated = truncateText(title, 50);
  return platform ? `${platform}: ${truncated}` : truncated;
}; 