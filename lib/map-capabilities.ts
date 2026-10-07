let available: boolean | undefined;
export function canUseWebGL(): boolean {
  if (available !== undefined) return available;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    available = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { available = false; }
  return available;
}
