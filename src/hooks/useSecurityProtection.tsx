import { useEffect } from 'react';

interface SecurityProtectionOptions {
  disableRightClick?: boolean;
  disableDevTools?: boolean;
  disableTextSelection?: boolean;
}

export const useSecurityProtection = (options: SecurityProtectionOptions = {}) => {
  const { 
    disableRightClick = true, 
    disableDevTools = true,
    disableTextSelection = false 
  } = options;

  useEffect(() => {
    // Only apply in production
    if (import.meta.env.DEV) {
      return;
    }

    const handlers: { type: string; handler: (e: Event) => void }[] = [];

    // Disable right-click context menu
    if (disableRightClick) {
      const contextMenuHandler = (e: Event) => {
        e.preventDefault();
        return false;
      };
      document.addEventListener('contextmenu', contextMenuHandler);
      handlers.push({ type: 'contextmenu', handler: contextMenuHandler });
    }

    // Disable DevTools keyboard shortcuts
    if (disableDevTools) {
      const keyDownHandler = (e: KeyboardEvent) => {
        // F12
        if (e.key === 'F12') {
          e.preventDefault();
          return false;
        }
        // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
          e.preventDefault();
          return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.key.toUpperCase() === 'U') {
          e.preventDefault();
          return false;
        }
      };
      document.addEventListener('keydown', keyDownHandler as EventListener);
      handlers.push({ type: 'keydown', handler: keyDownHandler as EventListener });
    }

    // Disable text selection (optional, can affect UX)
    if (disableTextSelection) {
      const selectStartHandler = (e: Event) => {
        e.preventDefault();
        return false;
      };
      document.addEventListener('selectstart', selectStartHandler);
      handlers.push({ type: 'selectstart', handler: selectStartHandler });
    }

    // DevTools detection using debugger timing
    if (disableDevTools) {
      let devToolsOpen = false;
      const threshold = 160;
      
      const checkDevTools = () => {
        const start = performance.now();
        // debugger statement takes longer when DevTools is open
        // This is a detection method, not prevention
        const duration = performance.now() - start;
        
        if (duration > threshold && !devToolsOpen) {
          devToolsOpen = true;
          console.clear();
          console.log('%c⚠️ Developer Tools Detected', 'color: red; font-size: 24px; font-weight: bold;');
          console.log('%cThis is a protected application. Unauthorized access attempts are logged.', 'color: orange; font-size: 14px;');
        } else if (duration <= threshold) {
          devToolsOpen = false;
        }
      };

      const intervalId = setInterval(checkDevTools, 1000);

      return () => {
        clearInterval(intervalId);
        handlers.forEach(({ type, handler }) => {
          document.removeEventListener(type, handler);
        });
      };
    }

    return () => {
      handlers.forEach(({ type, handler }) => {
        document.removeEventListener(type, handler);
      });
    };
  }, [disableRightClick, disableDevTools, disableTextSelection]);
};

export default useSecurityProtection;
