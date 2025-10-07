import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const ToastContext = createContext({
  pushToast: () => {},
  dismissToast: () => {},
  toasts: [],
});

let toastIdCounter = 0;

const createToast = (input) => {
  toastIdCounter += 1;
  return {
    id: `${Date.now()}-${toastIdCounter}`,
    title: input.title || 'Avisering',
    message: input.message || '',
    variant: input.variant || 'info',
    duration: input.duration ?? 6000,
  };
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismissToast = useCallback((toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
    const timeout = timeoutsRef.current.get(toastId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(toastId);
    }
  }, []);

  const pushToast = useCallback((input) => {
    const toast = createToast(input);
    setToasts((current) => [...current, toast]);

    if (toast.duration !== null) {
      const timeout = setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration);
      timeoutsRef.current.set(toast.id, timeout);
    }

    return toast.id;
  }, [dismissToast]);

  const contextValue = useMemo(() => ({
    toasts,
    pushToast,
    dismissToast,
  }), [dismissToast, pushToast, toasts]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

