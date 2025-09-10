'use client';
import { useState, useEffect } from 'react';

interface WindowSize {
  windowWidth: number;
  windowHeight: number;
}

export default function useScreenSize() {
  // settting the width and height of the screen as initial values
  const [windowSize, setWindowSize] = useState<WindowSize>({
    windowWidth: 0,
    windowHeight: 0,
  });
  const magnification = 1.1;

  useEffect(() => {
    // Window resize event handler
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const windowWidth = window.innerWidth * magnification;
      const windowHeight = window.innerHeight * magnification;
      setWindowSize({ windowWidth, windowHeight });
    };

    handleResize(); // Set initial size
    // resize event listener registration
    window.addEventListener('resize', handleResize);
    // Event listener removal when the component is unmounted
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}
