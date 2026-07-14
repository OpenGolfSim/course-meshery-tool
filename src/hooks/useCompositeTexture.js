import { useState, useEffect } from 'react';
import * as THREE from 'three';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function useCompositeTexture(baseUrl, overlayUrl, overlayOpacity = 0.6) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    // if (!baseUrl) {
    //   setTexture(null);
    //   return;
    // }

    let cancelled = false;

    async function composite() {
      let baseImg;
      const canvas = document.createElement('canvas');
      if (baseUrl) {
        let resolvedBase = baseUrl;
        if (resolvedBase.includes('hillshade')) {
          resolvedBase = resolvedBase.replace('.tif', '.jpg');
        }
        baseImg = await loadImage(resolvedBase);
        canvas.width = baseImg.naturalWidth;
        canvas.height = baseImg.naturalHeight;
      } else {
        canvas.width = 4096;
        canvas.height = 4096;
      }
      const ctx = canvas.getContext('2d');

      if (baseImg) {
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#aaa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (overlayUrl) {
        try {
          const overlayImg = await loadImage(overlayUrl);
          ctx.globalAlpha = overlayOpacity;
          ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
        } catch (e) {
          console.warn('Overlay image failed to load:', e);
        }
      }

      if (cancelled) return;

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      setTexture(tex);
    }

    composite().catch(console.error);
    return () => { cancelled = true; };
  }, [baseUrl, overlayUrl, overlayOpacity]);

  return texture;
}