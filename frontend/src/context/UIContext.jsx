import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomModal from '../components/CustomModal';

const UIContext = createContext();

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

export const UIProvider = ({ children }) => {
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info', 'success', 'error', 'warning', 'prompt'
    isPrompt: false,
    placeholder: '',
  });

  const [resolver, setResolver] = useState(null);

  const showModal = useCallback((message, title = 'Notification', type = 'info') => {
    setModal({
      isOpen: true,
      title,
      message,
      type,
      isPrompt: false,
    });
  }, []);

  const showPrompt = useCallback((message, title = 'Input Required', placeholder = 'Enter value...') => {
    setModal({
      isOpen: true,
      title,
      message,
      type: 'prompt',
      isPrompt: true,
      placeholder,
    });

    return new Promise((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const hideModal = useCallback(() => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    if (resolver) {
      resolver(null);
      setResolver(null);
    }
  }, [resolver]);

  const handleConfirm = useCallback((value) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    if (resolver) {
      resolver(value);
      setResolver(null);
    }
  }, [resolver]);

  return (
    <UIContext.Provider value={{ showModal, showPrompt, hideModal }}>
      {children}
      <CustomModal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        isPrompt={modal.isPrompt}
        placeholder={modal.placeholder}
        onClose={hideModal}
        onConfirm={handleConfirm}
      />
    </UIContext.Provider>
  );
};
