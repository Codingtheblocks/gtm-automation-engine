export const cleanText = (input = '') =>
  input
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .trim();

export const truncateText = (input = '', maxLength = 4000) => {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength)}...`;
};

export const fallbackServicesFromText = (text = '') => {
  const normalized = text.toLowerCase();
  const serviceKeywords = [
    'brake',
    'transmission',
    'tire',
    'engine',
    'alignment',
    'diagnostic',
    'oil change',
    'maintenance',
    'inspection',
    'repair',
    'fleet',
    'collision',
  ];

  return serviceKeywords.filter((keyword) => normalized.includes(keyword));
};
