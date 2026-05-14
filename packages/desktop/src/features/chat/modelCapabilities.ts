export function isOllamaModel(modelId: string): boolean {
  if (modelId === 'LOCAL') return true;
  if (modelId === 'DEEPSEEK') return false;
  if (modelId.includes('/')) return false;
  if (modelId.startsWith('gemini-') || modelId.startsWith('gemma-')) return false;
  if (modelId === 'LITE') return false;
  return true;
}

export function isGemmaModel(modelId: string): boolean {
  return modelId.startsWith('gemma-');
}

export function isFlashLiteModel(modelId: string): boolean {
  if (modelId === 'LITE') return true;
  return modelId.startsWith('gemini-') && modelId.includes('lite');
}
