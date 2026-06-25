export const cleanResponseContent = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Try to extract message from JSON
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.message) {
        return parsed.message;
      }
      if (parsed.content) {
        return parsed.content;
      }
      if (parsed.delta) {
        return parsed.delta;
      }
    }
  } catch (e) {
    // Not JSON or malformed, proceed
  }

  // Extract and preserve code blocks
  const codeBlocks: string[] = [];
  const withPlaceholders = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `%%%CODE_BLOCK_${codeBlocks.length - 1}%%%`;
  });

  // Remove unwanted tags
  let cleaned = withPlaceholders
    .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    cleaned = cleaned.replace(`%%%CODE_BLOCK_${idx}%%%`, block);
  });

  return cleaned;
};