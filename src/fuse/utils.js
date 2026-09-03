export const yieldToMain = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
